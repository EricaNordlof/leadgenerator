import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { config } from './config.js';
import { query, withTransaction } from './db.js';
import { inferLocation, productForOccasion, scoreLead } from './lead.js';
import { createDailyDigestDraft, gmailStatus } from './gmail.js';
import { extractSkolverketRows } from './skolverket.js';

function firstValue(...values) {
  return values.find((value) => String(value || '').trim())?.toString().trim() || '';
}

function validEmail(value) {
  const candidate = String(value || '').split(/[;,\s]+/).find((item) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item));
  return candidate || '';
}

function safeWebsite(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return '';
  }
}


const SKANE_MUNICIPALITIES = new Set([
  'bjuv', 'bromolla', 'bastad', 'burlov', 'eslov', 'helsingborg', 'hassleholm',
  'hoganas', 'hoor', 'horby', 'klippan', 'kavlinge', 'kristianstad', 'landskrona',
  'lomma', 'lund', 'malmo', 'osby', 'perstorp', 'simrishamn', 'sjobo', 'skurup',
  'staffanstorp', 'svalov', 'svedala', 'tomelilla', 'trelleborg', 'vellinge',
  'ystad', 'astorp', 'angelholm', 'orkelljunga', 'ostra goinge'
]);

function normalizeSwedish(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function primitiveValues(value, path = '', output = []) {
  if (value == null) return output;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    output.push({ path: path.toLowerCase(), value: String(value).trim() });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => primitiveValues(item, `${path}[${index}]`, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => primitiveValues(item, path ? `${path}.${key}` : key, output));
  }
  return output;
}

function pickPrimitive(entry, patterns) {
  const values = primitiveValues(entry);
  for (const pattern of patterns) {
    const normalized = pattern.toLowerCase();
    const exact = values.find((item) => item.path === normalized || item.path.endsWith(`.${normalized}`));
    if (exact?.value) return exact.value;
  }
  for (const pattern of patterns) {
    const normalized = pattern.toLowerCase();
    const fuzzy = values.find((item) => item.path.includes(normalized));
    if (fuzzy?.value) return fuzzy.value;
  }
  return '';
}

function nextSkolverketUrl(payload, currentUrl) {
  const candidate = payload?.links?.next?.href || payload?.links?.next || payload?._links?.next?.href || '';
  if (!candidate) return '';
  try { return new URL(candidate, currentUrl).toString(); } catch { return ''; }
}

function isSkaneSchool(entry) {
  const municipality = pickPrimitive(entry, [
    'municipality.name', 'municipalityName', 'municipality', 'kommunnamn', 'municipalityCodeName',
    'postalAddress.city', 'visitingAddress.city', 'address.city', 'city'
  ]);
  const region = pickPrimitive(entry, ['region.name', 'regionName', 'countyName', 'lanName', 'county']);
  const normalizedMunicipality = normalizeSwedish(municipality);
  const normalizedRegion = normalizeSwedish(region);
  return SKANE_MUNICIPALITIES.has(normalizedMunicipality) || normalizedRegion.includes('skane');
}

function skolverketRowToLead(entry) {
  const attributes = entry?.attributes && typeof entry.attributes === 'object'
    ? { ...entry, ...entry.attributes }
    : entry;
  if (!isSkaneSchool(attributes)) return null;

  const organization = pickPrimitive(attributes, [
    'schoolUnitName', 'schoolUnit.name', 'schoolName', 'name', 'designation'
  ]);
  if (!organization) return null;

  const status = normalizeSwedish(pickPrimitive(attributes, ['schoolUnitStatus', 'status.name', 'status']));
  if (/upphord|closed|inactive|avslutad/.test(status)) return null;

  const schoolTypes = primitiveValues(attributes)
    .filter((item) => /schooltype|schoolform|typeOfSchooling|skolform/i.test(item.path))
    .map((item) => normalizeSwedish(item.value))
    .join(' ');
  if (schoolTypes && !/grund|forskoleklass|specialskola|sameskola|anpassad/.test(schoolTypes)) return null;

  const schoolUnitCode = firstValue(
    pickPrimitive(attributes, ['schoolUnitCode', 'schoolUnit.code', 'code']),
    entry?.id
  );
  if (!schoolUnitCode) return null;

  const city = firstValue(pickPrimitive(attributes, [
    'municipality.name', 'municipalityName', 'municipality', 'kommunnamn',
    'postalAddress.city', 'visitingAddress.city', 'address.city', 'city'
  ]), 'Skåne');
  const email = validEmail(pickPrimitive(attributes, ['email.address', 'email.value', 'email', 'eMail']));
  const phone = pickPrimitive(attributes, ['phone.number', 'phone.value', 'telephone', 'phone']);
  const website = safeWebsite(pickPrimitive(attributes, ['website', 'webAddress', 'homepage', 'url']));
  const sourceUrl = `${config.discovery.skolverketUrl.replace(/\/$/, '')}/${encodeURIComponent(schoolUnitCode)}`;
  const lead = {
    organization,
    segment: 'school',
    city,
    contact_name: '',
    email,
    phone,
    website,
    source_url: sourceUrl,
    source_type: 'skolverket',
    source_external_id: String(schoolUnitCode),
    source_license: 'Skolverket öppna data · Creative Commons källicens',
    source_checked_at: new Date().toISOString().slice(0, 10),
    occasion: 'school_activity',
    product_type: 'children',
    participants: null,
    event_date: null,
    intent: 'unknown',
    location_fit: inferLocation(city),
    recurring: true,
    opportunity: `Skolenhet i ${city} som kan boka idrottsdag, aktivitetsdag, lovaktivitet eller gruppaktivitet med barnbollar.`,
    status: 'new',
    followup: null,
    notes: 'Kontrollera offentlig kontaktväg och rätt aktivitetsansvarig före kontakt.'
  };
  const score = scoreLead(lead);
  return { ...lead, score: score.total, score_reasons: score.reasons };
}

export async function fetchSkolverketLeads() {
  const all = [];
  let url = config.discovery.skolverketUrl;
  let page = 0;
  const visited = new Set();

  while (url && page < 50 && !visited.has(url)) {
    visited.add(url);
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': config.discovery.userAgent
      },
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`Skolverkets API svarade ${response.status}.`);
    const payload = await response.json();
    for (const row of extractSkolverketRows(payload)) {
      const lead = skolverketRowToLead(row);
      if (lead) all.push(lead);
    }
    url = nextSkolverketUrl(payload, url);
    page += 1;
  }

  return all;
}

function inferFromOsm(tags = {}) {
  const combined = [
    tags.amenity, tags.leisure, tags.club, tags.office, tags.tourism,
    tags.sport, tags.name, tags.description
  ].filter(Boolean).join(' ').toLowerCase();

  if (/school|kindergarten|childcare|youth|fritids|skola/.test(combined)) {
    return { segment: 'school', occasion: 'school_activity' };
  }
  if (/soccer|football|fotboll/.test(combined)) {
    return { segment: 'football', occasion: 'football_activity' };
  }
  if (/association|community|club|förening|sports_centre|stadium/.test(combined)) {
    return { segment: 'association', occasion: 'association_day' };
  }
  if (/conference|hotel|events_venue|event/.test(combined)) {
    return { segment: 'venue', occasion: 'event' };
  }
  if (/company|office/.test(combined)) {
    return { segment: 'company', occasion: 'kickoff' };
  }
  return { segment: 'other', occasion: 'event' };
}

function opportunityFor(segment, tags = {}) {
  const base = {
    school: 'Offentlig skola, fritidsverksamhet eller ungdomsverksamhet som kan boka aktivitetsdagar.',
    football: 'Fotbollsverksamhet som kan boka lagaktivitet, kickoff eller säsongsavslutning.',
    association: 'Förening eller idrottsanläggning som kan boka föreningsdag eller lovaktivitet.',
    company: 'Företag med möjlig matchning för kickoff eller teambuilding.',
    venue: 'Event-, hotell- eller konferensaktör som kan erbjuda bumperballs som aktivitetstillägg.',
    other: 'Offentlig verksamhet eller organisation med möjlig gruppaktivitet.'
  }[segment];
  return firstValue(tags.description, base);
}

function overpassQuery() {
  const bbox = config.discovery.bbox;
  return `[out:json][timeout:75];
(
  nwr["name"]["amenity"~"school|kindergarten|childcare|community_centre|conference_centre|events_venue"](${bbox});
  nwr["name"]["leisure"~"sports_centre|stadium"](${bbox});
  nwr["name"]["club"~"sport|community"](${bbox});
  nwr["name"]["office"="association"](${bbox});
  nwr["name"]["office"="company"]["contact:website"](${bbox});
  nwr["name"]["office"="company"]["website"](${bbox});
  nwr["name"]["office"="company"]["contact:email"](${bbox});
  nwr["name"]["tourism"~"hotel|camp_site|hostel"](${bbox});
);
out center tags;`;
}

export async function fetchOpenStreetMapLeads() {
  const response = await fetch(config.discovery.overpassUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': config.discovery.userAgent,
      accept: 'application/json'
    },
    body: new URLSearchParams({ data: overpassQuery() }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`Overpass API svarade ${response.status}.`);
  const data = await response.json();
  const leads = [];

  for (const element of data.elements || []) {
    const tags = element.tags || {};
    const organization = String(tags.name || '').trim();
    if (!organization) continue;
    const classification = inferFromOsm(tags);
    const website = safeWebsite(firstValue(tags['contact:website'], tags.website));
    const email = validEmail(firstValue(tags['contact:email'], tags.email));
    const phone = firstValue(tags['contact:phone'], tags.phone);
    const city = firstValue(tags['addr:city'], tags['addr:municipality'], tags['is_in:city'], tags['is_in']);

    // Företag utan någon offentlig kontaktväg blir ofta brus. Övriga målgrupper får vara kvar.
    if (classification.segment === 'company' && !website && !email && !phone) continue;

    const productType = productForOccasion(classification.occasion);
    const sourceExternalId = `${element.type}/${element.id}`;
    const lead = {
      organization,
      segment: classification.segment,
      city,
      contact_name: '',
      email,
      phone,
      website,
      source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      source_type: 'openstreetmap',
      source_external_id: sourceExternalId,
      source_license: 'OpenStreetMap contributors · ODbL',
      source_checked_at: new Date().toISOString().slice(0, 10),
      occasion: classification.occasion,
      product_type: productType,
      participants: null,
      event_date: null,
      intent: 'unknown',
      location_fit: inferLocation(city),
      recurring: ['school', 'football', 'association', 'venue'].includes(classification.segment),
      opportunity: opportunityFor(classification.segment, tags),
      status: 'new',
      followup: null,
      notes: ''
    };
    const score = scoreLead(lead);
    leads.push({ ...lead, score: score.total, score_reasons: score.reasons });
  }

  return leads;
}

function parseFeedDescriptor(value) {
  const [name, ...rest] = value.split('|');
  return { name: rest.length ? name.trim() : 'official-feed', url: (rest.length ? rest.join('|') : name).trim() };
}

function assertAllowedFeed(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:') throw new Error('Offentliga feeds måste använda HTTPS.');
  if (!config.discovery.allowedFeedDomains.has(url.hostname)) {
    throw new Error(`Domänen ${url.hostname} finns inte i PUBLIC_FEED_ALLOWED_DOMAINS.`);
  }
  return url;
}

function rowsFromFeed(text, contentType) {
  if (contentType.includes('json') || /^[\s\n]*[\[{]/.test(text)) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.data)) return parsed.data;
    if (Array.isArray(parsed.results)) return parsed.results;
    throw new Error('JSON-feeden saknar en lista i roten, data eller results.');
  }
  return parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
}

function feedRowToLead(row, sourceName, sourceUrl) {
  const organization = firstValue(row.organization, row.name, row.company, row.organisation);
  if (!organization) return null;
  const descriptive = [row.segment, row.category, row.type, row.description, row.opportunity].join(' ').toLowerCase();
  let segment = ['school', 'football', 'association', 'company', 'event', 'venue', 'private', 'other'].includes(row.segment)
    ? row.segment
    : 'other';
  if (segment === 'other') {
    if (/skola|fritids|school/.test(descriptive)) segment = 'school';
    else if (/fotboll|football|soccer/.test(descriptive)) segment = 'football';
    else if (/förening|association|club/.test(descriptive)) segment = 'association';
    else if (/event|konferens|hotel/.test(descriptive)) segment = 'venue';
    else if (/företag|company/.test(descriptive)) segment = 'company';
  }
  const occasion = firstValue(row.occasion) || ({
    school: 'school_activity', football: 'football_activity', association: 'association_day',
    company: 'kickoff', event: 'event', venue: 'event', private: 'birthday'
  }[segment] || 'other');
  const externalSeed = firstValue(row.id, row.external_id, row.website, row.email, `${organization}|${row.city || ''}`);
  const sourceExternalId = crypto.createHash('sha256').update(`${sourceName}|${externalSeed}`).digest('hex');
  const lead = {
    organization,
    segment,
    city: firstValue(row.city, row.municipality, row.kommun, row.ort),
    contact_name: firstValue(row.contactName, row.contact_name, row.contact),
    email: validEmail(row.email),
    phone: firstValue(row.phone, row.telephone, row.telefon),
    website: safeWebsite(firstValue(row.website, row.url)),
    source_url: firstValue(row.sourceUrl, row.source_url, sourceUrl),
    source_type: sourceName,
    source_external_id: sourceExternalId,
    source_license: firstValue(row.license, row.licence, 'Offentlig feed – kontrollera källvillkor'),
    source_checked_at: new Date().toISOString().slice(0, 10),
    occasion,
    product_type: firstValue(row.productType, row.product_type, productForOccasion(occasion)),
    participants: row.participants ? Number(row.participants) : null,
    event_date: firstValue(row.eventDate, row.event_date) || null,
    intent: firstValue(row.intent, 'unknown'),
    location_fit: inferLocation(firstValue(row.city, row.municipality, row.kommun, row.ort)),
    recurring: ['true', '1', 'yes', 'ja'].includes(String(row.recurring || '').toLowerCase()),
    opportunity: firstValue(row.opportunity, row.description, 'Offentlig organisationspost med möjlig bumperball-matchning.'),
    status: 'new',
    followup: null,
    notes: ''
  };
  const score = scoreLead(lead);
  return { ...lead, score: score.total, score_reasons: score.reasons };
}

export async function fetchOfficialFeedLeads() {
  const all = [];
  for (const descriptorValue of config.discovery.publicFeedUrls) {
    const descriptor = parseFeedDescriptor(descriptorValue);
    const url = assertAllowedFeed(descriptor.url);
    const response = await fetch(url, {
      headers: { 'user-agent': config.discovery.userAgent, accept: 'application/json,text/csv,text/plain' },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`${descriptor.name} svarade ${response.status}.`);
    const text = await response.text();
    const rows = rowsFromFeed(text, response.headers.get('content-type') || '');
    for (const row of rows) {
      const lead = feedRowToLead(row, descriptor.name, descriptor.url);
      if (lead) all.push(lead);
    }
  }
  return all;
}

async function upsertLeads(client, leads, source) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const newLeadRows = [];

  for (const lead of leads) {
    const result = await client.query(
      `INSERT INTO leads (
         organization, segment, city, contact_name, email, phone, website, source_url,
         source_type, source_external_id, source_license, source_checked_at, occasion,
         product_type, participants, event_date, intent, location_fit, recurring,
         opportunity, status, followup, notes, score, score_reasons, discovered_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,now()
       )
       ON CONFLICT (source_type, source_external_id) WHERE source_external_id <> ''
       DO UPDATE SET
         organization = EXCLUDED.organization,
         city = CASE WHEN EXCLUDED.city <> '' THEN EXCLUDED.city ELSE leads.city END,
         email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE leads.email END,
         phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE leads.phone END,
         website = CASE WHEN EXCLUDED.website <> '' THEN EXCLUDED.website ELSE leads.website END,
         source_url = EXCLUDED.source_url,
         source_license = EXCLUDED.source_license,
         source_checked_at = EXCLUDED.source_checked_at,
         score = EXCLUDED.score,
         score_reasons = EXCLUDED.score_reasons,
         updated_at = now()
       RETURNING id, organization, email, website, city, opportunity, score, (xmax = 0) AS inserted`,
      [
        lead.organization, lead.segment, lead.city, lead.contact_name, lead.email, lead.phone,
        lead.website, lead.source_url, lead.source_type || source, lead.source_external_id,
        lead.source_license, lead.source_checked_at, lead.occasion, lead.product_type,
        lead.participants, lead.event_date, lead.intent, lead.location_fit, lead.recurring,
        lead.opportunity, lead.status, lead.followup, lead.notes, lead.score,
        JSON.stringify(lead.score_reasons)
      ]
    );
    if (!result.rowCount) {
      skipped += 1;
    } else if (result.rows[0].inserted) {
      inserted += 1;
      newLeadRows.push(result.rows[0]);
    } else {
      updated += 1;
    }
    if (inserted >= config.discovery.maxNew) break;
  }
  return { inserted, updated, skipped, newLeadRows };
}

async function runSource(source, fetcher) {
  const run = await query(
    `INSERT INTO discovery_runs (source, status) VALUES ($1, 'running') RETURNING id`,
    [source]
  );
  const runId = run.rows[0].id;
  try {
    const leads = await fetcher();
    const summary = await withTransaction((client) => upsertLeads(client, leads, source));
    await query(
      `UPDATE discovery_runs SET status = 'completed', found_count = $2, inserted_count = $3,
       updated_count = $4, skipped_count = $5, finished_at = now() WHERE id = $1`,
      [runId, leads.length, summary.inserted, summary.updated, summary.skipped]
    );
    return { source, found: leads.length, ...summary };
  } catch (error) {
    await query(
      `UPDATE discovery_runs SET status = 'failed', errors = $2::jsonb, finished_at = now() WHERE id = $1`,
      [runId, JSON.stringify([error.message])]
    );
    return { source, found: 0, inserted: 0, updated: 0, skipped: 0, newLeadRows: [], error: error.message };
  }
}

export async function runDiscovery({ createDigest = true } = {}) {
  const results = [];
  if (config.discovery.skolverketEnabled) {
    results.push(await runSource('skolverket', fetchSkolverketLeads));
  }
  results.push(await runSource('openstreetmap', fetchOpenStreetMapLeads));
  if (config.discovery.publicFeedUrls.length) {
    results.push(await runSource('official-feeds', fetchOfficialFeedLeads));
  }
  const newLeads = results.flatMap((result) => result.newLeadRows || []);

  if (createDigest && config.discovery.createDigestDraft && newLeads.length) {
    try {
      const adminResult = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [config.adminEmail]);
      const admin = adminResult.rows[0];
      if (admin) {
        const status = await gmailStatus(admin.id);
        if (status.connected) await createDailyDigestDraft(admin.id, newLeads);
      }
    } catch (error) {
      console.warn('Kunde inte skapa dagens Gmail-utkast:', error.message);
    }
  }

  return {
    results: results.map(({ newLeadRows, ...result }) => result),
    newLeads: newLeads.length,
    completedAt: new Date().toISOString()
  };
}
