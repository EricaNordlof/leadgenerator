import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { authenticate, ensureCsrfToken, requireAuth, requireCsrf, sanitizeUser } from './auth.js';
import { query } from './db.js';
import { scoreLead, productForOccasion, inferLocation } from './lead.js';
import {
  buildLeadDraft,
  createLeadDraft,
  createGmailTestDraft,
  disconnectGmail,
  getAuthorizationUrl,
  gmailStatus,
  saveAuthorizationCode
} from './gmail.js';
import { createHandoff } from './booking.js';
import { runDiscovery } from './discovery.js';

export const router = express.Router();

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const leadSchema = z.object({
  organization: z.string().trim().min(2).max(200),
  segment: z.enum(['school', 'football', 'association', 'company', 'event', 'venue', 'private', 'other']).default('other'),
  city: z.string().trim().max(120).default(''),
  contact_name: z.string().trim().max(150).default(''),
  email: z.union([z.literal(''), z.string().email()]).default(''),
  phone: z.string().trim().max(60).default(''),
  website: z.string().trim().max(500).default(''),
  source_url: z.string().trim().max(1000).default(''),
  source_type: z.string().trim().max(100).default('manual'),
  source_external_id: z.string().trim().max(300).default(''),
  source_license: z.string().trim().max(300).default(''),
  occasion: z.enum([
    'school_activity', 'birthday', 'football_activity', 'association_day', 'kickoff',
    'family_day', 'hen_party', 'stag_party', 'event', 'other'
  ]).default('other'),
  product_type: z.enum(['children', 'adult', 'both', 'unknown']).default('unknown'),
  participants: z.union([z.number().int().min(1).max(500), z.null()]).optional().default(null),
  event_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().default(null),
  intent: z.enum(['high', 'medium', 'low', 'unknown']).default('unknown'),
  location_fit: z.enum(['malmo', 'skane', 'outside', 'unknown']).default('unknown'),
  recurring: z.boolean().default(false),
  opportunity: z.string().trim().max(3000).default(''),
  status: z.enum(['new', 'qualified', 'contacted', 'followup', 'quoted', 'won', 'lost']).default('new'),
  followup: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().default(null),
  notes: z.string().trim().max(5000).default('')
});

function cleanLeadInput(body) {
  const source = { ...body };
  if (source.participants === '' || source.participants == null) source.participants = null;
  else source.participants = Number(source.participants);
  if (!source.event_date) source.event_date = null;
  if (!source.followup) source.followup = null;
  source.recurring = Boolean(source.recurring);
  if (!source.product_type && source.occasion) source.product_type = productForOccasion(source.occasion);
  if (!source.location_fit || source.location_fit === 'unknown') source.location_fit = inferLocation(source.city);
  return leadSchema.parse(source);
}

function publicUser(req) {
  return sanitizeUser(req.session.user);
}

router.get('/health', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, service: 'bumperball-leadgenerator-v3', version: config.version, time: new Date().toISOString() });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
  const credentials = schema.parse(req.body);
  const user = await authenticate(credentials.email, credentials.password);
  if (!user) return res.status(401).json({ error: 'Fel e-postadress eller lösenord.' });

  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
  req.session.user = user;
  const csrfToken = ensureCsrfToken(req);
  await new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
  res.json({ user, csrfToken });
}));

router.post('/auth/logout', requireAuth, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('bumperball.sid');
    res.status(204).end();
  });
});

router.get('/auth/me', asyncHandler(async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Inte inloggad.' });
  const gmail = await gmailStatus(req.session.user.id);
  res.json({
    user: publicUser(req),
    csrfToken: ensureCsrfToken(req),
    gmail,
    business: config.business,
    appUrl: config.appUrl
  });
}));

router.get('/dashboard', requireAuth, asyncHandler(async (_req, res) => {
  const [statsResult, runsResult, handoffResult] = await Promise.all([
    query(`SELECT
      count(*) FILTER (WHERE archived_at IS NULL) AS total,
      count(*) FILTER (WHERE discovered_at >= current_date AND archived_at IS NULL) AS today,
      count(*) FILTER (WHERE score >= 85 AND status NOT IN ('won','lost') AND archived_at IS NULL) AS hot,
      count(*) FILTER (WHERE followup IS NOT NULL AND followup <= current_date AND status NOT IN ('won','lost') AND archived_at IS NULL) AS due,
      count(*) FILTER (WHERE status = 'won' AND archived_at IS NULL) AS won,
      count(*) FILTER (WHERE status = 'quoted' AND archived_at IS NULL) AS quoted
      FROM leads`),
    query('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT 8'),
    query('SELECT * FROM booking_handoffs ORDER BY created_at DESC LIMIT 8')
  ]);
  res.json({
    stats: Object.fromEntries(Object.entries(statsResult.rows[0]).map(([key, value]) => [key, Number(value)])),
    runs: runsResult.rows,
    handoffs: handoffResult.rows
  });
}));

router.get('/leads', requireAuth, asyncHandler(async (req, res) => {
  const conditions = ['archived_at IS NULL'];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    conditions.push(clause.replace('?', `$${values.length}`));
  };

  if (req.query.view === 'today') conditions.push('discovered_at >= current_date');
  if (req.query.segment && req.query.segment !== 'all') add('segment = ?', req.query.segment);
  if (req.query.product && req.query.product !== 'all') add('product_type = ?', req.query.product);
  if (req.query.status && req.query.status !== 'all') add('status = ?', req.query.status);
  if (req.query.search) {
    add(`to_tsvector('simple', concat_ws(' ', organization, city, contact_name, email, opportunity))
      @@ plainto_tsquery('simple', ?)`, req.query.search);
  }

  const sort = {
    score: 'score DESC, discovered_at DESC',
    newest: 'discovered_at DESC, score DESC',
    followup: 'followup ASC NULLS LAST, score DESC',
    organization: 'organization ASC'
  }[req.query.sort] || (req.query.view === 'today' ? 'score DESC, discovered_at DESC' : 'updated_at DESC');

  const result = await query(
    `SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY ${sort} LIMIT 500`,
    values
  );
  res.json({ leads: result.rows });
}));

router.get('/leads/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  const drafts = await query('SELECT * FROM email_drafts WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id]);
  const handoffs = await query('SELECT * FROM booking_handoffs WHERE lead_id = $1 ORDER BY created_at DESC', [req.params.id]);
  res.json({ lead: result.rows[0], drafts: drafts.rows, handoffs: handoffs.rows });
}));

router.post('/leads', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const lead = cleanLeadInput(req.body);
  const score = scoreLead(lead);
  const result = await query(
    `INSERT INTO leads (
      organization, segment, city, contact_name, email, phone, website, source_url, source_type,
      source_external_id, source_license, source_checked_at, occasion, product_type, participants,
      event_date, intent, location_fit, recurring, opportunity, status, followup, notes,
      score, score_reasons, created_by, assigned_to
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,current_date,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,$25)
    RETURNING *`,
    [
      lead.organization, lead.segment, lead.city, lead.contact_name, lead.email, lead.phone,
      lead.website, lead.source_url, lead.source_type, lead.source_external_id, lead.source_license,
      lead.occasion, lead.product_type, lead.participants, lead.event_date, lead.intent,
      lead.location_fit, lead.recurring, lead.opportunity, lead.status, lead.followup, lead.notes,
      score.total, JSON.stringify(score.reasons), req.session.user.id
    ]
  );
  res.status(201).json({ lead: result.rows[0] });
}));

router.patch('/leads/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  const lead = cleanLeadInput({ ...existing.rows[0], ...req.body });
  const score = scoreLead(lead);
  const result = await query(
    `UPDATE leads SET
      organization=$2, segment=$3, city=$4, contact_name=$5, email=$6, phone=$7,
      website=$8, source_url=$9, source_type=$10, source_external_id=$11,
      source_license=$12, occasion=$13, product_type=$14, participants=$15,
      event_date=$16, intent=$17, location_fit=$18, recurring=$19, opportunity=$20,
      status=$21, followup=$22, notes=$23, score=$24, score_reasons=$25::jsonb,
      updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      req.params.id, lead.organization, lead.segment, lead.city, lead.contact_name, lead.email,
      lead.phone, lead.website, lead.source_url, lead.source_type, lead.source_external_id,
      lead.source_license, lead.occasion, lead.product_type, lead.participants, lead.event_date,
      lead.intent, lead.location_fit, lead.recurring, lead.opportunity, lead.status,
      lead.followup, lead.notes, score.total, JSON.stringify(score.reasons)
    ]
  );
  res.json({ lead: result.rows[0] });
}));

router.delete('/leads/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const result = await query(
    'UPDATE leads SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id',
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  res.status(204).end();
}));

router.post('/leads/:id/draft-preview', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const typeSchema = z.object({ type: z.enum(['first', 'followup', 'event']).default('first') });
  const { type } = typeSchema.parse(req.body || {});
  const result = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  res.json({ draft: buildLeadDraft(result.rows[0], type) });
}));

router.post('/leads/:id/gmail-draft', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const typeSchema = z.object({ type: z.enum(['first', 'followup', 'event']).default('first') });
  const { type } = typeSchema.parse(req.body || {});
  const result = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  const draft = await createLeadDraft(req.session.user.id, result.rows[0], type);
  await query(
    `UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
     followup = COALESCE(followup, current_date + 4), updated_at = now() WHERE id = $1`,
    [req.params.id]
  );
  res.status(201).json({ draft });
}));

router.post('/leads/:id/convert', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const { mode } = z.object({ mode: z.enum(['quote', 'booking']) }).parse(req.body);
  const result = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Leaden hittades inte.' });
  const handoff = await createHandoff({ lead: result.rows[0], userId: req.session.user.id, mode });
  res.status(201).json({ handoff });
}));

router.post('/discovery/run', requireAuth, requireCsrf, asyncHandler(async (_req, res) => {
  const result = await runDiscovery({ createDigest: false });
  res.json(result);
}));

router.get('/discovery/runs', requireAuth, asyncHandler(async (_req, res) => {
  const result = await query('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT 50');
  res.json({ runs: result.rows });
}));

router.post('/internal/discovery', asyncHandler(async (req, res) => {
  const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!config.cronSecret || supplied !== config.cronSecret) return res.status(401).json({ error: 'Ogiltig cron-nyckel.' });
  const result = await runDiscovery({ createDigest: true });
  res.json(result);
}));

router.get('/integrations/status', requireAuth, asyncHandler(async (req, res) => {
  const gmail = await gmailStatus(req.session.user.id);
  res.json({
    gmail,
    booking: {
      configured: Boolean(config.booking.appUrl),
      webhookConfigured: Boolean(config.booking.webhookUrl),
      appUrl: config.booking.appUrl
    },
    discovery: {
      openStreetMap: true,
      overpassEndpoints: config.discovery.overpassUrls.length,
      overpassTiles: config.discovery.osmTiles,
      skolverket: config.discovery.skolverketEnabled,
      skolverketDetailBudget: config.discovery.skolverketDetailBudget,
      officialFeeds: config.discovery.publicFeedUrls.length,
      dailySchedule: '05:00 UTC',
      maxNew: config.discovery.maxNew
    }
  });
}));

router.get('/integrations/gmail/connect', requireAuth, (req, res) => {
  const state = crypto.randomBytes(24).toString('base64url');
  req.session.gmailOauthState = state;
  res.redirect(getAuthorizationUrl(state));
});

router.get('/integrations/gmail/callback', requireAuth, asyncHandler(async (req, res) => {
  if (!req.query.state || req.query.state !== req.session.gmailOauthState) {
    return res.status(400).send('Ogiltig OAuth-state. Försök ansluta Gmail igen.');
  }
  delete req.session.gmailOauthState;
  await saveAuthorizationCode(req.session.user.id, String(req.query.code || ''));
  res.redirect('/?gmail=connected');
}));

router.post('/integrations/gmail/test-draft', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const draft = await createGmailTestDraft(req.session.user.id);
  res.status(201).json({ draft });
}));

router.delete('/integrations/gmail', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  await disconnectGmail(req.session.user.id);
  res.status(204).end();
}));
