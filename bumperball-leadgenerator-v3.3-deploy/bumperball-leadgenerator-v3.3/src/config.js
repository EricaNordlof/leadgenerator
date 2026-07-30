import 'dotenv/config';

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'ja', 'on'].includes(String(value).toLowerCase());
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const renderUrl = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : '';

const overpassUrls = unique([
  ...list(process.env.OVERPASS_URLS),
  process.env.OVERPASS_URL,
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]);

export const config = Object.freeze({
  version: '3.3.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'development-session-secret-change-me',
  encryptionKey: process.env.APP_ENCRYPTION_KEY || 'development-encryption-key-change-me',
  appUrl: (process.env.APP_URL || renderUrl || 'http://localhost:3000').replace(/\/$/, ''),
  adminEmail: process.env.ADMIN_EMAIL || 'kontakt@offroadbumpis.se',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Erica Nordlöf',
  business: {
    legalName: process.env.BUSINESS_NAME || 'Nordlöf Nordic',
    brandName: process.env.BRAND_NAME || 'Offroad Bumpis',
    email: process.env.BUSINESS_EMAIL || 'kontakt@offroadbumpis.se',
    phone: process.env.BUSINESS_PHONE || '0793442520',
    website: process.env.BUSINESS_WEBSITE || 'https://offroadbumpis.se'
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || ''
  },
  discovery: {
    overpassUrls,
    skolverketEnabled: boolean(process.env.SKOLVERKET_ENABLED, true),
    skolverketUrl: process.env.SKOLVERKET_URL || 'https://api.skolverket.se/skolenhetsregistret/v2/school-units',
    skolverketDetailBudget: integer(process.env.SKOLVERKET_DETAIL_BUDGET, 360),
    skolverketConcurrency: integer(process.env.SKOLVERKET_CONCURRENCY, 8),
    skolverketTimeoutMs: integer(process.env.SKOLVERKET_TIMEOUT_MS, 20_000),
    bbox: process.env.DISCOVERY_BBOX || '55.30,12.35,56.50,14.75',
    maxNew: integer(process.env.DISCOVERY_MAX_NEW, 80),
    osmTiles: integer(process.env.DISCOVERY_OSM_TILES, 6),
    osmConcurrency: integer(process.env.DISCOVERY_OSM_CONCURRENCY, 3),
    osmTimeoutMs: integer(process.env.DISCOVERY_OSM_TIMEOUT_MS, 55_000),
    userAgent: process.env.DISCOVERY_USER_AGENT || 'OffroadBumpisLeadgenerator/3.3 (kontakt@offroadbumpis.se)',
    publicFeedUrls: list(process.env.PUBLIC_FEED_URLS),
    allowedFeedDomains: new Set(list(process.env.PUBLIC_FEED_ALLOWED_DOMAINS)),
    createDigestDraft: boolean(process.env.CREATE_DAILY_DIGEST_DRAFT, true)
  },
  booking: {
    appUrl: process.env.BOOKING_APP_URL || 'https://offroad-bumpis-booking.onrender.com',
    webhookUrl: process.env.BOOKING_WEBHOOK_URL || '',
    webhookSecret: process.env.BOOKING_WEBHOOK_SECRET || ''
  },
  cronSecret: process.env.CRON_SECRET || ''
});

export function assertProductionConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL saknas.');
  if (config.nodeEnv === 'production' && !config.adminPassword) {
    throw new Error('ADMIN_PASSWORD måste anges i produktion.');
  }
}
