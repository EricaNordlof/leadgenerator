import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { config } from './config.js';
import { query, withTransaction } from './db.js';
import { inferLocation, productForOccasion, scoreLead } from './lead.js';
import { createDailyDigestDraft, gmailStatus } from './gmail.js';
import { extractSkolverketDetail, extractSkolverketRows } from './skolverket.js';
import { bboxString, mapLimit, normalizeSwedish, rotateSlice, sleep, splitBbox } from './discovery-utils.js';

function firstValue(...values) {
  return values.find((value) => String(value || '').trim())?.toString().trim() || '';
}

function validEmail(value) {
  const candidate = String(value || '')
    .split(/[;,\s]+/)
    .find((item) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item));
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

function websiteKey(value) {
  try {
    const url = new URL(safeWebsite(value));
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`.toLowerCase();
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

function valuesMatching(entry, pattern) {
  return primitiveValues(entry)
    .filter((item) => pattern.test(item.path))
    .map((item) => item.value)
    .filter(Boolean);
}

function isSkaneSchool(entry) {
  const municipality = pickPrimitive(entry, [
    'municipality.name', 'municipalityName', 'municipality', 'kommunnamn', 'municipalityCodeName',
    'postalAddress.city', 'visitingAddress.city', 'address.city', 'city'
  ]);
  const region = pickPrimitive(entry, ['region.name', 'regionName', 'countyName', 'lanName', 'county', 'län']);
  const normalizedMunicipality = normalizeSwedish(municipality);
  const normalizedRegion = normalizeSwedish(region);
  return SKANE_MUNICIPALITIES.has(normalizedMunicipality) || normalizedRegion.includes('skane');
}

function schoolProductType(entry, organization) {
  const schoolTypes = valuesMatching(entry, /schooltype|schoolform|typeofschooling|skolform|schooltypeproperties/i)
    .map(normalizeSwedish)
    .join(' ');
  const combined = `${schoolTypes} ${normalizeSwedish(organization)}`;
  const children = /(^|\s)(gr|gran|sam|sp|grund|anpassad grund|specialskola|sameskola)(\s|$)|f 9|f-9|1 9|4 9|7 9/.test(combined);
  const adult = /(^|\s)(gy|gyan|gymnas|ungdomsgymnas)(\s|$)/.test(combined);
  const excluded = /forskola|vuxenutbild|komvux|sfi|särvux/.test(combined) && !children && !adult;
  if (excluded) return 'unknown';
  if (children && adult) return 'both';
  if (adult) return 'adult';
  if (children) return 'children';
  return 'children';
}

function skolverketEntryCode(entry) {
  return firstValue(
    pickPrimitive(entry, ['schoolUnitCode', 'schoolUnit.code', 'code']),
    entry?.id
  );
}

function skolverketEntryStatus(entry) {
  return normalizeSwedish(pickPrimitive(entry, ['schoolUnitStatus', 'status.name', 'status']));
}

function skolverketRowToLead(entry, fallback = {}) {
  const attributes = entry?.attributes && typeof entry.attributes === 'object'
    ? { ...fallback, ...entry, ...entry.attributes }
    : { ...fallback, ...entry };

  if (!isSkaneSchool(attributes)) return null;

  const organization = firstValue(
    pickPrimitive(attributes, ['schoolUnitName', 'schoolUnit.name', 'schoolName', 'name', 'designation']),
    fallback?.name
  );
  if (!organization) return null;

  const status = skolverketEntryStatus(attributes);
  if (status && status !== 'aktiv' && !status.includes('active')) return null;

  const schoolUnitCode = firstValue(skolverketEntryCode(attributes), skolverketEntryCode(fallback));
  if (!schoolUnitCode) return null;

  const productType = schoolProductType(attributes, organization);
  if (productType === 'unknown') return null;

  const city = firstValue(pickPrimitive(attributes, [
    'municipality.name', 'municipalityName', 'municipality', 'kommunnamn',
    'postalAddress.city', 'visitingAddress.city', 'address.city', 'city'
  ]), 'Skåne');
  const email = validEmail(pickPrimitive(attributes, [
    'email.address', 'email.value', 'emails[0].address', 'contact.email', 'email', 'eMail'
  ]));
  const phone = pickPrimitive(attributes, [
    'phone.number', 'phone.value', 'phones[0].number', 'contact.phone', 'telephone', 'phone'
  ]);
  const website = safeWebsite(pickPrimitive(attributes, [
    'website', 'webAddress', 'homepage', 'url', 'organizer.website'
  ]));
  const sourceUrl = `${config.discovery.skolverketUrl.replace(/\/$/, '')}/${encodeURIComponent(schoolUnitCode)}`;
  const productText = productType === 'adult'
    ? 'vuxenbollar från 12 år'
    : productType === 'both'
      ? 'barn- eller vuxenbollar beroende på elevgrupp'
      : 'barnbollar för 7–12 år';

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
    product_type: productType,
    participants: null,
    event_date: null,
    intent: 'unknown',
    location_fit: inferLocation(city),
    recurring: true,
    opportunity: `Aktiv skolenhet i ${city} som kan boka idrottsdag, aktivitetsdag, lovaktivitet eller klassaktivitet med ${productText}.`,
    status: 'new',
    followup: null,
    notes: email || phone || website
      ? 'Offentlig kontaktväg hittad. Kontrollera rätt aktivitetsansvarig före kontakt.'
      : 'Sök offentlig kontaktväg och rätt aktivitetsansvarig före kontakt.'
  };
  const score = scoreLead(lead);
  return { ...lead, score: score.total, score_reasons: score.reasons };
}

async function fetchJson(url, { timeoutMs = 30_000, attempts = 2, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': config.discovery.userAgent, ...headers },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const error = new Error(`${new URL(url).hostname} svarade ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError' || error?.name === 'AbortError' || !error.status || error.status === 429 || error.status >= 500;
      if (!retryable || attempt === attempts - 1) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastError;
}

async function getSetting(key, fallback = null) {
  const result = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return result.rowCount ? result.rows[0].value : fallback;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

export async function fetchSkolverketLeads() {
  const listPayload = await fetchJson(config.discovery.skolverketUrl, {
    timeoutMs: 90_000,
    attempts: 3
  });
  const rows = extractSkolverketRows(listPayload);
  const activeRows = rows
    .filter((row) => {
      const status = skolverketEntryStatus(row);
      return !status || status === 'aktiv' || status.includes('active');
    })
    .filter((row) => skolverketEntryCode(row))
    .sort((a, b) => skolverketEntryCode(a).localeCompare(skolverketEntryCode(b)));

  if (!activeRows.length) {
    throw new Error('Skolverkets lista innehöll inga aktiva skolenheter. API-formatet kan ha ändrats.');
  }

  const cursorValue = await getSetting('skolverket_detail_cursor', 0);
  const cursor = Number(cursorValue) || 0;
  const selectedRows = rotateSlice(activeRows, cursor, config.discovery.skolverketDetailBudget);
  const warnings = [];

  const detailResults = await mapLimit(selectedRows, config.discovery.skolverketConcurrency, async (row) => {
    const code = skolverketEntryCode(row);
    const detailUrl = `${config.discovery.skolverketUrl.replace(/\/$/, '')}/${encodeURIComponent(code)}`;
    try {
      const payload = await fetchJson(detailUrl, {
        timeoutMs: config.discovery.skolverketTimeoutMs,
        attempts: 2
      });
      return skolverketRowToLead(extractSkolverketDetail(payload), row);
    } catch (error) {
      warnings.push(`${code}: ${error.message}`);
      return null;
    }
  });

  const nextCursor = activeRows.length ? (cursor + selectedRows.length) % activeRows.length : 0;
  await setSetting('skolverket_detail_cursor', nextCursor);

  const leads = detailResults.filter(Boolean);
  return {
    leads,
    warnings: warnings.slice(0, 20),
    meta: {
      listRows: rows.length,
      activeRows: activeRows.length,
      detailScanned: selectedRows.length,
      skaneMatches: leads.length,
      nextCursor
    }
  };
}

function inferFromOsm(tags = {}) {
  const combined = [
    tags.amenity, tags.leisure, tags.club, tags.office, tags.tourism,
    tags.sport, tags.name, tags.description
  ].filter(Boolean).join(' ').toLowerCase();

  if (/school|youth_centre|youth|fritids|skola/.test(combined)) {
    return { segment: 'school', occasion: 'school_activity' };
  }
  if (/soccer|football|fotboll/.test(combined)) {
    return { segment: 'football', occasion: 'football_activity' };
  }
  if (/association|community|club|förening|sports_centre|stadium/.test(combined)) {
    return { segment: 'association', occasion: 'association_day' };
  }
  if (/conference|hotel|hostel|camp_site|events_venue|event/.test(combined)) {
    return { segment: 'venue', occasion: 'event' };
  }
  if (/company|office/.test(combined)) {
    return { segment: 'company', occasion: 'kickoff' };
  }
  return { segment: 'other', occasion: 'event' };
}

function opportunityFor(segment, tags = {}) {
  const base = {
    school: 'Skola, fritids- eller ungdomsverksamhet som kan boka aktivitetsdagar.',
    football: 'Fotbollsverksamhet som kan boka lagaktivitet, kickoff eller säsongsavslutning.',
    association: 'Förening eller idrottsanläggning som kan boka föreningsdag eller lovaktivitet.',
    company: 'Företag med möjlig matchning för kickoff eller teambuilding.',
    venue: 'Event-, hotell- eller konferensaktör som kan erbjuda bumperballs som aktivitetstillägg.',
    other: 'Offentlig verksamhet eller organisation med möjlig gruppaktivitet.'
  }[segment];
  return firstValue(tags.description, base);
}

const OSM_GROUPS = [
  {
    name: 'fotboll-idrott',
    selectors: [
      'nwr["name"]["sport"~"soccer|football"]',
      'nwr["name"]["club"="sport"]["sport"~"soccer|football"]',
      'nwr["name"]["leisure"~"sports_centre|stadium"]["sport"~"soccer|football"]'
    ]
  },
  {
    name: 'föreningar-ungdom',
    selectors: [
      'nwr["name"]["amenity"~"community_centre|social_centre"]',
      'nwr["name"]["amenity"="youth_centre"]',
      'nwr["name"]["club"~"community|sport"]',
      'nwr["name"]["office"="association"]'
    ]
  },
  {
    name: 'event-lokaler',
    selectors: [
      'nwr["name"]["amenity"~"conference_centre|events_venue"]',
      'nwr["name"]["tourism"~"hotel|hostel|camp_site"]',
      'nwr["name"]["leisure"~"sports_centre|stadium"]'
    ]
  },
  {
    name: 'företag-kontaktbara',
    selectors: [
      'nwr["name"]["office"="company"]["contact:website"]',
      'nwr["name"]["office"="company"]["website"]',
      'nwr["name"]["office"="company"]["contact:email"]',
      'nwr["name"]["office"="company"]["contact:phone"]'
    ]
  }
];

export function buildOverpassTasks() {
  const tiles = splitBbox(config.discovery.bbox, config.discovery.osmTiles);
  return tiles.flatMap((tile, tileIndex) => OSM_GROUPS.map((group, groupIndex) => {
    const bbox = bboxString(tile);
    const selectors = group.selectors.map((selector) => `  ${selector}(${bbox});`).join('\n');
    return {
      id: `${tileIndex + 1}-${group.name}`,
      tileIndex,
      groupIndex,
      group: group.name,
      query: `[out:json][timeout:45];\n(\n${selectors}\n);\nout center tags;`
    };
  }));
}

async function requestOverpass(task, taskIndex) {
  const endpoints = config.discovery.overpassUrls;
  const errors = [];

  for (let offset = 0; offset < endpoints.length; offset += 1) {
    const endpoint = endpoints[(taskIndex + offset) % endpoints.length];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': config.discovery.userAgent,
          accept: 'application/json'
        },
        body: new URLSearchParams({ data: task.query }),
        signal: AbortSignal.timeout(config.discovery.osmTimeoutMs)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      const data = await response.json();
      return { task, endpoint, elements: data.elements || [] };
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error.message}`);
      await sleep(250 * (offset + 1));
    }
  }

  throw new Error(`${task.id}: ${errors.join(' | ')}`);
}

function osmElementToLead(element) {
  const tags = element.tags || {};
  const organization = String(tags.name || '').trim();
  if (!organization) return null;
  const classification = inferFromOsm(tags);
  const website = safeWebsite(firstValue(tags['contact:website'], tags.website));
  const email = validEmail(firstValue(tags['contact:email'], tags.email));
  const phone = firstValue(tags['contact:phone'], tags.phone);
  const city = firstValue(tags['addr:city'], tags['addr:municipality'], tags['is_in:city'], tags['is_in'], 'Skåne');

  if (classification.segment === 'company' && !website && !email && !phone) return null;

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
    location_fit: city === 'Skåne' ? 'skane' : inferLocation(city),
    recurring: ['school', 'football', 'association', 'venue'].includes(classification.segment),
    opportunity: opportunityFor(classification.segment, tags),
    status: 'new',
    followup: null,
    notes: email || phone || website ? 'Offentlig kontaktväg hittad i OpenStreetMap.' : 'Kontrollera offentlig kontaktväg före kontakt.'
  };
  const score = scoreLead(lead);
  return { ...lead, score: score.total, score_reasons: score.reasons };
}

export async function fetchOpenStreetMapLeads() {
  const tasks = buildOverpassTasks();
  const warnings = [];
  const results = await mapLimit(tasks, config.discovery.osmConcurrency, async (task, index) => {
    try {
      return await requestOverpass(task, index);
    } catch (error) {
      warnings.push(error.message);
      return null;
    }
  });

  const successful = results.filter(Boolean);
  if (!successful.length) {
    throw new Error(`Alla ${tasks.length} uppdelade Overpass-frågor misslyckades. ${warnings[0] || ''}`.trim());
  }

  const elements = new Map();
  for (const result of successful) {
    for (const element of result.elements) elements.set(`${element.type}/${element.id}`, element);
  }

  const leads = [...elements.values()].map(osmElementToLead).filter(Boolean);
  return {
    leads,
    warnings: warnings.slice(0, 20),
    meta: {
      tasks: tasks.length,
      completedTasks: successful.length,
      failedTasks: warnings.length,
      endpointsUsed: [...new Set(successful.map((item) => new URL(item.endpoint).hostname))],
      uniqueElements: elements.size
    }
  };
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
  const warnings = [];
  for (const descriptorValue of config.discovery.publicFeedUrls) {
    const descriptor = parseFeedDescriptor(descriptorValue);
    try {
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
    } catch (error) {
      warnings.push(`${descriptor.name}: ${error.message}`);
    }
  }
  if (!all.length && warnings.length) throw new Error(warnings.join(' | '));
  return { leads: all, warnings, meta: { feeds: config.discovery.publicFeedUrls.length } };
}

function contactPriority(lead) {
  return (lead.email ? 30 : 0) + (lead.website ? 15 : 0) + (lead.phone ? 10 : 0) + Number(lead.score || 0);
}

async function findExistingLead(client, lead) {
  const sourceMatch = await client.query(
    `SELECT * FROM leads WHERE source_type = $1 AND source_external_id = $2 AND source_external_id <> '' LIMIT 1`,
    [lead.source_type, lead.source_external_id]
  );
  if (sourceMatch.rowCount) return sourceMatch.rows[0];

  const org = normalizeSwedish(lead.organization);
  const city = normalizeSwedish(lead.city);
  const email = String(lead.email || '').toLowerCase();
  const webKey = websiteKey(lead.website);
  const candidates = await client.query(
    `SELECT * FROM leads
     WHERE archived_at IS NULL
       AND (
         ($1 <> '' AND lower(email) = $1)
         OR ($2 <> '' AND trim(lower(regexp_replace(regexp_replace(website, '^https?://(www\\.)?', ''), '/$', ''))) = $2)
         OR (trim(lower(regexp_replace(translate(organization, 'ÅÄÖåäö', 'AAOaao'), '[^a-zA-Z0-9]+', ' ', 'g'))) = $3
             AND ($4 = '' OR trim(lower(regexp_replace(translate(city, 'ÅÄÖåäö', 'AAOaao'), '[^a-zA-Z0-9]+', ' ', 'g'))) = $4))
       )
     LIMIT 1`,
    [email, webKey, org, city]
  );
  return candidates.rows[0] || null;
}

async function updateExistingLead(client, existing, lead) {
  const result = await client.query(
    `UPDATE leads SET
       organization = CASE WHEN $2 <> '' THEN $2 ELSE organization END,
       city = CASE WHEN $3 <> '' THEN $3 ELSE city END,
       contact_name = CASE WHEN contact_name = '' AND $4 <> '' THEN $4 ELSE contact_name END,
       email = CASE WHEN email = '' AND $5 <> '' THEN $5 ELSE email END,
       phone = CASE WHEN phone = '' AND $6 <> '' THEN $6 ELSE phone END,
       website = CASE WHEN website = '' AND $7 <> '' THEN $7 ELSE website END,
       source_checked_at = $8,
       score = GREATEST(score, $9),
       score_reasons = CASE WHEN $9 >= score THEN $10::jsonb ELSE score_reasons END,
       updated_at = now()
     WHERE id = $1
     RETURNING id, organization, email, website, city, opportunity, score`,
    [
      existing.id, lead.organization, lead.city, lead.contact_name, lead.email, lead.phone,
      lead.website, lead.source_checked_at, lead.score, JSON.stringify(lead.score_reasons)
    ]
  );
  return result.rows[0];
}

async function insertLead(client, lead) {
  const result = await client.query(
    `INSERT INTO leads (
       organization, segment, city, contact_name, email, phone, website, source_url,
       source_type, source_external_id, source_license, source_checked_at, occasion,
       product_type, participants, event_date, intent, location_fit, recurring,
       opportunity, status, followup, notes, score, score_reasons, discovered_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,now()
     )
     RETURNING id, organization, email, website, city, opportunity, score`,
    [
      lead.organization, lead.segment, lead.city, lead.contact_name, lead.email, lead.phone,
      lead.website, lead.source_url, lead.source_type, lead.source_external_id,
      lead.source_license, lead.source_checked_at, lead.occasion, lead.product_type,
      lead.participants, lead.event_date, lead.intent, lead.location_fit, lead.recurring,
      lead.opportunity, lead.status, lead.followup, lead.notes, lead.score,
      JSON.stringify(lead.score_reasons)
    ]
  );
  return result.rows[0];
}

async function upsertLeads(client, leads, maxNew) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const newLeadRows = [];
  const ordered = [...leads].sort((a, b) => contactPriority(b) - contactPriority(a));

  for (const lead of ordered) {
    const existing = await findExistingLead(client, lead);
    if (existing) {
      await updateExistingLead(client, existing, lead);
      updated += 1;
      continue;
    }
    if (inserted >= maxNew) {
      skipped += 1;
      continue;
    }
    try {
      const row = await insertLead(client, lead);
      inserted += 1;
      newLeadRows.push(row);
    } catch (error) {
      if (error?.code === '23505') {
        skipped += 1;
      } else {
        throw error;
      }
    }
  }
  return { inserted, updated, skipped, newLeadRows };
}

function normalizeFetcherResult(value) {
  if (Array.isArray(value)) return { leads: value, warnings: [], meta: {} };
  return {
    leads: Array.isArray(value?.leads) ? value.leads : [],
    warnings: Array.isArray(value?.warnings) ? value.warnings.filter(Boolean) : [],
    meta: value?.meta && typeof value.meta === 'object' ? value.meta : {}
  };
}

async function runSource(source, fetcher, maxNew) {
  const started = Date.now();
  const run = await query(
    `INSERT INTO discovery_runs (source, status) VALUES ($1, 'running') RETURNING id`,
    [source]
  );
  const runId = run.rows[0].id;
  try {
    const fetched = normalizeFetcherResult(await fetcher());
    const summary = await withTransaction((client) => upsertLeads(client, fetched.leads, maxNew));
    const durationMs = Date.now() - started;
    const status = fetched.warnings.length ? 'partial' : 'completed';
    await query(
      `UPDATE discovery_runs SET status = $2, found_count = $3, inserted_count = $4,
       updated_count = $5, skipped_count = $6, errors = $7::jsonb, details = $8::jsonb,
       duration_ms = $9, finished_at = now() WHERE id = $1`,
      [
        runId, status, fetched.leads.length, summary.inserted, summary.updated, summary.skipped,
        JSON.stringify(fetched.warnings), JSON.stringify(fetched.meta), durationMs
      ]
    );
    return { source, status, found: fetched.leads.length, warnings: fetched.warnings, meta: fetched.meta, durationMs, ...summary };
  } catch (error) {
    const durationMs = Date.now() - started;
    await query(
      `UPDATE discovery_runs SET status = 'failed', errors = $2::jsonb, duration_ms = $3,
       finished_at = now() WHERE id = $1`,
      [runId, JSON.stringify([error.message]), durationMs]
    );
    return {
      source,
      status: 'failed',
      found: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      newLeadRows: [],
      warnings: [],
      meta: {},
      durationMs,
      error: error.message
    };
  }
}

async function acquireDiscoveryLock() {
  const result = await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('discovery_lock', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     WHERE app_settings.updated_at < now() - interval '20 minutes'
     RETURNING key`,
    [JSON.stringify({ startedAt: new Date().toISOString() })]
  );
  return result.rowCount > 0;
}

async function releaseDiscoveryLock() {
  await query(`DELETE FROM app_settings WHERE key = 'discovery_lock'`);
}

export async function runDiscovery({ createDigest = true } = {}) {
  const locked = await acquireDiscoveryLock();
  if (!locked) {
    return {
      busy: true,
      results: [],
      newLeads: 0,
      maxNew: config.discovery.maxNew,
      completedAt: new Date().toISOString(),
      message: 'En leadinsamling körs redan. Vänta tills den är klar.'
    };
  }

  try {
    const results = [];
    let remaining = config.discovery.maxNew;

    if (config.discovery.skolverketEnabled) {
      const result = await runSource('skolverket', fetchSkolverketLeads, remaining);
      results.push(result);
      remaining = Math.max(0, remaining - result.inserted);
    }

    const osmResult = await runSource('openstreetmap', fetchOpenStreetMapLeads, remaining);
    results.push(osmResult);
    remaining = Math.max(0, remaining - osmResult.inserted);

    if (config.discovery.publicFeedUrls.length) {
      const feedResult = await runSource('official-feeds', fetchOfficialFeedLeads, remaining);
      results.push(feedResult);
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
      busy: false,
      results: results.map(({ newLeadRows, ...result }) => result),
      newLeads: newLeads.length,
      maxNew: config.discovery.maxNew,
      completedAt: new Date().toISOString()
    };
  } finally {
    await releaseDiscoveryLock();
  }
}
