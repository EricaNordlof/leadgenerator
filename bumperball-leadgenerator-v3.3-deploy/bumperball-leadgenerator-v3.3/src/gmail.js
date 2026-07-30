import { google } from 'googleapis';
import { config } from './config.js';
import { decrypt, encrypt } from './crypto.js';
import { query } from './db.js';
import { PRODUCT_FACTS, recommendationFor } from './lead.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email'
];

function oauthClient() {
  if (!config.gmail.clientId || !config.gmail.clientSecret) {
    throw new Error('Gmail OAuth är inte konfigurerat. Lägg in GMAIL_CLIENT_ID och GMAIL_CLIENT_SECRET.');
  }
  return new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    `${config.appUrl}/api/integrations/gmail/callback`
  );
}

export function gmailConfigured() {
  return Boolean(config.gmail.clientId && config.gmail.clientSecret);
}

export function getAuthorizationUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
}

export async function saveAuthorizationCode(userId, code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const profile = await oauth2.userinfo.get();
  const previous = await query('SELECT encrypted_refresh_token FROM gmail_connections WHERE user_id = $1', [userId]);
  const existingRefresh = previous.rows[0]?.encrypted_refresh_token
    ? decrypt(previous.rows[0].encrypted_refresh_token)
    : '';
  const refreshToken = tokens.refresh_token || existingRefresh;
  if (!refreshToken) throw new Error('Google returnerade ingen refresh token. Koppla bort appen i Google-kontot och försök igen.');

  await query(
    `INSERT INTO gmail_connections (user_id, gmail_email, encrypted_refresh_token, scopes, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id) DO UPDATE SET
       gmail_email = EXCLUDED.gmail_email,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       scopes = EXCLUDED.scopes,
       updated_at = now()`,
    [userId, profile.data.email || config.business.email, encrypt(refreshToken), SCOPES]
  );
  return profile.data.email;
}

export async function disconnectGmail(userId) {
  await query('DELETE FROM gmail_connections WHERE user_id = $1', [userId]);
}

export async function gmailStatus(userId) {
  const result = await query(
    'SELECT gmail_email, connected_at, updated_at FROM gmail_connections WHERE user_id = $1',
    [userId]
  );
  return {
    configured: gmailConfigured(),
    connected: Boolean(result.rowCount),
    email: result.rows[0]?.gmail_email || ''
  };
}

async function authorizedClient(userId) {
  const result = await query(
    'SELECT encrypted_refresh_token, gmail_email FROM gmail_connections WHERE user_id = $1',
    [userId]
  );
  if (!result.rowCount) throw new Error('Ingen Gmail-brevlåda är ansluten.');
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(result.rows[0].encrypted_refresh_token) });
  return { client, gmailEmail: result.rows[0].gmail_email || config.business.email };
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function rawMessage({ to, subject, body, from }) {
  const lines = [
    `From: ${from}`,
    to ? `To: ${to}` : '',
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64')
  ].filter((line, index) => line || index >= 6);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

function occasionLabel(value) {
  return {
    school_activity: 'skolaktivitet eller idrottsdag',
    birthday: 'barnkalas',
    football_activity: 'lagaktivitet eller säsongsavslutning',
    association_day: 'föreningsdag',
    kickoff: 'kickoff eller teambuilding',
    family_day: 'företags- eller familjedag',
    hen_party: 'möhippa',
    stag_party: 'svensexa',
    event: 'event eller festival'
  }[value] || 'gruppaktivitet';
}

function segmentAngle(value) {
  return {
    school: 'ni arbetar med barn och återkommande aktiviteter',
    football: 'lagavslutningar och aktiviteter utanför den vanliga träningen ofta uppskattas',
    association: 'föreningar ofta behöver enkla aktiviteter som fungerar för grupper',
    company: 'kickoff och personaldag blir bättre med en lättsam fysisk aktivitet',
    event: 'bumperballs kan bli ett tydligt aktivitetstillägg i era kundevent',
    venue: 'grupper som bokar lokal ofta även söker en aktivitet',
    private: 'ni planerar gruppaktiviteter där bumperballs kan passa'
  }[value] || 'ni kan ha grupper där bumperballs passar';
}

export function buildLeadDraft(lead, type = 'first') {
  const recommendation = recommendationFor(lead);
  const firstName = lead.contact_name ? lead.contact_name.split(/\s+/)[0] : '';
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,';
  const occasion = occasionLabel(lead.occasion);
  const participantText = lead.participants
    ? `För cirka ${lead.participants} deltagare är ett rimligt första upplägg ${recommendation.packageText}.`
    : 'Upplägget anpassas efter deltagarnas ålder, vikt och gruppstorlek.';
  const productFacts = PRODUCT_FACTS[lead.product_type] || PRODUCT_FACTS.unknown;
  const signature = `Vänliga hälsningar\nErica Nordlöf\n${config.business.brandName} · ${config.business.legalName}\n${config.business.email} · ${config.business.phone}\n${config.business.website}`;

  if (type === 'followup') {
    return {
      subject: `Uppföljning: bumperballs för ${lead.organization}`,
      body: `${greeting}\n\nJag följer upp mitt tidigare förslag om bumperballs för ${occasion} hos ${lead.organization}.\n\n${participantText}\n\n${productFacts}\n\nÄr det relevant för er, eller ska jag återkomma vid ett senare tillfälle?\n\n${signature}`
    };
  }

  if (type === 'event') {
    return {
      subject: `Bumperballs till ${occasion}${lead.event_date ? ` ${new Date(lead.event_date).toLocaleDateString('sv-SE')}` : ''}`,
      body: `${greeting}\n\n${config.business.brandName} hyr ut bumperballs till kalas, skolor, föreningar, lag och företag i Skåne.\n\n${participantText}\n\n${productFacts}\n\nBollarna fungerar på gräs, konstgräs och i idrottshall. Jag skickar gärna ett konkret upplägg med antal bollar, pris och praktisk information.\n\nVill ni att jag tar fram ett förslag?\n\n${signature}`
    };
  }

  return {
    subject: `Förslag: ${occasion} med bumperballs för ${lead.organization}`,
    body: `${greeting}\n\nJag kontaktar er eftersom ${segmentAngle(lead.segment)}.\n\n${config.business.brandName} i Malmö hyr ut bumperballs till barnkalas, skolor, fotbollslag, föreningar, företag och andra grupper i Skåne. ${productFacts}\n\n${participantText}\n\nBollarna fungerar på gräs, konstgräs och i idrottshall. Jag kan skicka ett enkelt förslag med antal bollar, pris och möjliga tider utan att boka in ett möte först.\n\nÄr det relevant att jag skickar ett konkret upplägg?\n\n${signature}`
  };
}

export async function createLeadDraft(userId, lead, type = 'first') {
  if (!lead.email) throw new Error('Leaden saknar e-postadress.');
  const { client, gmailEmail } = await authorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const draft = buildLeadDraft(lead, type);
  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: rawMessage({
          to: lead.email,
          subject: draft.subject,
          body: draft.body,
          from: gmailEmail
        })
      }
    }
  });

  await query(
    `INSERT INTO email_drafts (lead_id, user_id, gmail_draft_id, recipient, subject, body, draft_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [lead.id, userId, response.data.id || '', lead.email, draft.subject, draft.body, type]
  );
  return { id: response.data.id, ...draft };
}

export async function createDailyDigestDraft(userId, leads) {
  if (!leads.length) return null;
  const { client, gmailEmail } = await authorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const subject = `Dagens nya bumperball-leads – ${leads.length} st`;
  const body = [
    `Här är dagens nya leads för ${config.business.brandName}.`,
    '',
    ...leads.slice(0, 30).flatMap((lead, index) => [
      `${index + 1}. ${lead.organization} – ${lead.city || 'ort saknas'} – ${lead.score} poäng`,
      `   ${lead.email || lead.website || 'Kontaktväg saknas'}`,
      `   ${lead.opportunity || 'Kvalificera aktivitet och gruppstorlek.'}`,
      ''
    ]),
    `Öppna ${config.appUrl} för att granska och skapa enskilda utkast.`,
    '',
    'Detta är endast ett utkast och har inte skickats automatiskt.'
  ].join('\n');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: rawMessage({
          to: config.adminEmail,
          subject,
          body,
          from: gmailEmail
        })
      }
    }
  });
  await query(
    `INSERT INTO email_drafts (user_id, gmail_draft_id, recipient, subject, body, draft_type)
     VALUES ($1, $2, $3, $4, $5, 'digest')`,
    [userId, response.data.id || '', config.adminEmail, subject, body]
  );
  return response.data.id;
}

export async function createGmailTestDraft(userId) {
  const { client, gmailEmail } = await authorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const subject = 'Test: Offroad Bumpis Leadgenerator är ansluten';
  const body = [
    'Gmail-kopplingen fungerar.',
    '',
    'Detta meddelande skapades som ett utkast av Offroad Bumpis Leadgenerator Pro.',
    'Ingenting har skickats automatiskt.',
    '',
    `Ansluten brevlåda: ${gmailEmail}`,
    `Tid: ${new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`
  ].join('\n');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: rawMessage({
          to: gmailEmail,
          subject,
          body,
          from: gmailEmail
        })
      }
    }
  });

  await query(
    `INSERT INTO email_drafts (user_id, gmail_draft_id, recipient, subject, body, draft_type)
     VALUES ($1, $2, $3, $4, $5, 'test')`,
    [userId, response.data.id || '', gmailEmail, subject, body]
  );

  return { id: response.data.id || '', subject, body, recipient: gmailEmail };
}
