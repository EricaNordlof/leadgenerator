'use strict';

const STORAGE_KEY = 'offroad-bumpis-leads-v2';
const LEGACY_STORAGE_KEY = 'nordlof-leadgenerator-v1';
const ADULT_AVAILABLE_FROM = '2026-09-01';

const STATUSES = {
  new: 'Ny',
  qualified: 'Kvalificerad',
  contacted: 'Kontaktad',
  followup: 'Följ upp',
  quoted: 'Offert skickad',
  won: 'Bokad',
  lost: 'Inte aktuell'
};

const SEGMENTS = {
  school: {
    label: 'Skola & fritids',
    short: 'Skola',
    points: 20,
    angle: 'ni arbetar med barn och återkommande aktiviteter där en fysisk och tydlig gruppaktivitet kan passa',
    searches: ['grundskola', 'fritidshem', 'fritidsgård', 'skolaktivitet']
  },
  football: {
    label: 'Fotbollsklubb',
    short: 'Fotboll',
    points: 20,
    angle: 'lagaktiviteter, avslutningar och kickoff brukar vara naturliga tillfällen att göra något utanför den vanliga träningen',
    searches: ['fotbollsklubb ungdom', 'fotbollsförening', 'fotbollslag barn', 'fotbollscamp']
  },
  association: {
    label: 'Förening',
    short: 'Förening',
    points: 18,
    angle: 'föreningsdagar, lovaktiviteter och prova-på-evenemang ofta behöver en aktivitet som är enkel att förstå och rolig i grupp',
    searches: ['idrottsförening', 'ungdomsförening', 'förening barn unga', 'föreningsaktivitet']
  },
  company: {
    label: 'Företag',
    short: 'Företag',
    points: 18,
    angle: 'kickoff, personaldag och teambuilding blir bättre när aktiviteten är lättsam, fysisk och inte kräver förkunskaper',
    searches: ['företag', 'företagsnätverk', 'personalaktivitet företag', 'företagsevent']
  },
  event: {
    label: 'Eventbyrå',
    short: 'Eventbyrå',
    points: 20,
    angle: 'bumperballs kan bli ett tydligt aktivitetstillägg i era kundevent utan att deltagarna behöver kunna någon särskild sport',
    searches: ['eventbyrå', 'eventföretag', 'aktivitetsarrangör', 'företagsevent arrangör']
  },
  venue: {
    label: 'Fest- / konferenslokal',
    short: 'Lokal',
    points: 17,
    angle: 'grupper som bokar fest eller konferens ofta även letar efter en aktivitet att lägga till före eller under arrangemanget',
    searches: ['konferensanläggning', 'festlokal', 'eventlokal', 'konferens aktivitet']
  },
  private: {
    label: 'Privat arrangör',
    short: 'Privat',
    points: 13,
    angle: 'ni planerar en gruppaktivitet där bumperballs kan bli den del som deltagarna faktiskt pratar om efteråt',
    searches: ['barnkalas arrangör', 'möhippa arrangör', 'svensexa arrangör', 'gruppaktivitet']
  },
  other: {
    label: 'Övrig',
    short: 'Övrig',
    points: 10,
    angle: 'ni kan ha grupper eller arrangemang där en enkel och fysisk aktivitet passar',
    searches: ['gruppaktivitet', 'event', 'barnaktivitet', 'teambuilding']
  }
};

const OCCASIONS = {
  school_activity: { label: 'Skolaktivitet / idrottsdag', points: 15, suggestedProduct: 'children' },
  birthday: { label: 'Barnkalas', points: 15, suggestedProduct: 'children' },
  football_activity: { label: 'Lagaktivitet / säsongsavslutning', points: 15, suggestedProduct: 'children' },
  association_day: { label: 'Föreningsdag', points: 14, suggestedProduct: 'both' },
  kickoff: { label: 'Kickoff / teambuilding', points: 15, suggestedProduct: 'adult' },
  family_day: { label: 'Företags- / familjedag', points: 15, suggestedProduct: 'both' },
  hen_party: { label: 'Möhippa', points: 15, suggestedProduct: 'adult' },
  stag_party: { label: 'Svensexa', points: 15, suggestedProduct: 'adult' },
  event: { label: 'Event / festival', points: 14, suggestedProduct: 'both' },
  other: { label: 'Annan aktivitet', points: 7, suggestedProduct: 'unknown' }
};

const PRODUCTS = {
  children: {
    label: 'Barnbollar',
    short: 'Barn',
    points: 15,
    facts: 'Barnbollar för 7–12 år, max 60 kg. 12 bollar finns bokningsbara.'
  },
  adult: {
    label: 'Vuxenbollar',
    short: 'Vuxen',
    points: 15,
    facts: 'Vuxenbollar från 12 år, max 90 kg. 12 bollar är bokningsbara från 1 september 2026.'
  },
  both: {
    label: 'Barn- och vuxenbollar',
    short: 'Barn + vuxen',
    points: 15,
    facts: 'Kombinationsupplägg med barnbollar 7–12 år, max 60 kg, och vuxenbollar från 12 år, max 90 kg.'
  },
  unknown: {
    label: 'Ej bedömt',
    short: 'Ej bedömt',
    points: 5,
    facts: 'Ålder, vikt och gruppstorlek behöver kontrolleras innan rätt bolltyp väljs.'
  }
};

const SOURCES = {
  google: 'Google',
  maps: 'Google Maps',
  municipality: 'Kommun / offentlig lista',
  social: 'Sociala medier',
  recommendation: 'Tips / rekommendation',
  incoming: 'Inkommande förfrågan',
  other: 'Annan'
};

const demoLeads = [
  {
    organization: 'Söderparkens Fritids',
    segment: 'school',
    city: 'Malmö',
    contactName: 'Aktivitetsansvarig',
    email: 'fritids@example.se',
    phone: '',
    website: 'https://example.se',
    sourceUrl: 'https://example.se/fritids',
    sourceType: 'municipality',
    occasion: 'school_activity',
    productType: 'children',
    participants: 24,
    eventDate: '',
    intent: 'high',
    locationFit: 'malmo',
    recurring: true,
    opportunity: 'Ordnar lovaktiviteter och har tillgång till en idrottshall.',
    status: 'qualified',
    followup: '',
    notes: 'Kontakta skriftligt med ett enkelt upplägg för rotation.',
    updatedAt: Date.now() - 1000
  },
  {
    organization: 'Västra Hamnens Fotboll Ungdom',
    segment: 'football',
    city: 'Malmö',
    contactName: 'Ungdomsansvarig',
    email: '',
    phone: '',
    website: 'https://example.com',
    sourceUrl: 'https://example.com/kontakt',
    sourceType: 'google',
    occasion: 'football_activity',
    productType: 'unknown',
    participants: 18,
    eventDate: '',
    intent: 'low',
    locationFit: 'malmo',
    recurring: true,
    opportunity: 'Har flera ungdomslag och arrangerar säsongsavslutningar.',
    status: 'new',
    followup: '',
    notes: '',
    updatedAt: Date.now() - 2000
  },
  {
    organization: 'Öresund Teamdag AB',
    segment: 'company',
    city: 'Lund',
    contactName: 'HR',
    email: 'hr@example.se',
    phone: '',
    website: 'https://example.org',
    sourceUrl: 'https://example.org/om-oss',
    sourceType: 'google',
    occasion: 'kickoff',
    productType: 'adult',
    participants: 20,
    eventDate: '2026-09-18',
    intent: 'high',
    locationFit: 'skane',
    recurring: false,
    opportunity: 'Planerar kickoff i september och söker aktivitet i Skåne.',
    status: 'contacted',
    followup: '2026-08-05',
    notes: 'Vuxenbollar är tillgängliga före deras datum.',
    updatedAt: Date.now() - 3000
  },
  {
    organization: 'Skåne Fest & Event',
    segment: 'event',
    city: 'Helsingborg',
    contactName: 'Bokningsansvarig',
    email: '',
    phone: '',
    website: 'https://example.net',
    sourceUrl: 'https://example.net/aktiviteter',
    sourceType: 'maps',
    occasion: 'event',
    productType: 'both',
    participants: 40,
    eventDate: '2026-10-10',
    intent: 'low',
    locationFit: 'skane',
    recurring: false,
    opportunity: 'Säljer gruppaktiviteter och kan erbjuda bumperballs som bokningsbart tillval.',
    status: 'new',
    followup: '',
    notes: '',
    updatedAt: Date.now() - 4000
  }
];

let leads = loadLeads();
let selectedId = null;
let editingId = null;
let currentSearches = [];
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const refs = {
  rows: $('leadRows'),
  empty: $('emptyState'),
  search: $('searchInput'),
  segment: $('segmentFilter'),
  product: $('productFilter'),
  status: $('statusFilter'),
  sort: $('sortSelect'),
  dialog: $('leadDialog'),
  form: $('leadForm')
};

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function cloneDemoLeads() {
  return demoLeads.map((lead) => normalizeLead({ ...lead, id: uid(), createdAt: Date.now() }));
}

function loadLeads() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return stored.map(normalizeLead);
  } catch (error) {
    console.warn('Kunde inte läsa v2-data:', error);
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (Array.isArray(legacy) && legacy.length) {
      const knownDemoNames = new Set([
        'Malmö Markservice AB',
        'Öresund Fastighetsservice',
        'Skåne Event & Aktivitet'
      ]);
      const onlyLegacyDemo = legacy.every((lead) => knownDemoNames.has(lead.company));
      if (!onlyLegacyDemo) {
        return legacy.map(migrateLegacyLead);
      }
    }
  } catch (error) {
    console.warn('Kunde inte migrera äldre data:', error);
  }

  return cloneDemoLeads();
}

function migrateLegacyLead(legacy) {
  const text = `${legacy.industry || ''} ${legacy.need || ''}`;
  const segment = inferSegment(text);
  const occasion = inferOccasion(text, segment);
  const productType = OCCASIONS[occasion]?.suggestedProduct || 'unknown';

  return normalizeLead({
    id: legacy.id || uid(),
    organization: legacy.company || 'Namnlös lead',
    segment,
    city: legacy.city || '',
    contactName: legacy.contactName || '',
    email: legacy.email || '',
    phone: '',
    website: legacy.website || '',
    sourceUrl: legacy.website || '',
    sourceType: 'other',
    occasion,
    productType,
    participants: '',
    eventDate: '',
    intent: Number(legacy.needStrength) >= 30 ? 'high' : 'medium',
    locationFit: /malmö/i.test(legacy.city || '') ? 'malmo' : 'skane',
    recurring: false,
    opportunity: legacy.need || '',
    status: STATUSES[legacy.status] ? legacy.status : 'new',
    followup: legacy.followup || '',
    notes: legacy.notes || '',
    createdAt: legacy.updatedAt || Date.now(),
    updatedAt: legacy.updatedAt || Date.now()
  });
}

function normalizeLead(raw = {}) {
  const segment = SEGMENTS[raw.segment] ? raw.segment : inferSegment(`${raw.industry || ''} ${raw.opportunity || raw.need || ''}`);
  const occasion = OCCASIONS[raw.occasion] ? raw.occasion : inferOccasion(raw.opportunity || raw.need || '', segment);
  const suggestedProduct = OCCASIONS[occasion]?.suggestedProduct || 'unknown';

  return {
    id: raw.id || uid(),
    organization: String(raw.organization || raw.company || 'Namnlös lead').trim(),
    segment,
    city: String(raw.city || '').trim(),
    contactName: String(raw.contactName || '').trim(),
    email: String(raw.email || '').trim(),
    phone: String(raw.phone || '').trim(),
    website: String(raw.website || '').trim(),
    sourceUrl: String(raw.sourceUrl || '').trim(),
    sourceType: SOURCES[raw.sourceType] ? raw.sourceType : 'other',
    sourceCheckedAt: raw.sourceCheckedAt || todayISO(),
    occasion,
    productType: PRODUCTS[raw.productType] ? raw.productType : suggestedProduct,
    participants: raw.participants === '' || raw.participants == null ? '' : Number(raw.participants),
    eventDate: String(raw.eventDate || '').slice(0, 10),
    intent: ['high', 'medium', 'low', 'unknown'].includes(raw.intent) ? raw.intent : 'medium',
    locationFit: ['malmo', 'skane', 'outside', 'unknown'].includes(raw.locationFit) ? raw.locationFit : inferLocation(raw.city),
    recurring: Boolean(raw.recurring === true || raw.recurring === 'true' || raw.recurring === '1'),
    opportunity: String(raw.opportunity || raw.need || '').trim(),
    status: STATUSES[raw.status] ? raw.status : 'new',
    followup: String(raw.followup || '').slice(0, 10),
    notes: String(raw.notes || '').trim(),
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Number(raw.updatedAt || Date.now())
  };
}

function inferSegment(text = '') {
  const value = text.toLowerCase();
  if (/skola|fritids|fritidsgård|elev/.test(value)) return 'school';
  if (/fotboll|lag|klubb/.test(value)) return 'football';
  if (/förening|idrott/.test(value)) return 'association';
  if (/eventbyrå|eventföretag|arrangör/.test(value)) return 'event';
  if (/konferens|festlokal|eventlokal/.test(value)) return 'venue';
  if (/företag|personal|hr|kickoff/.test(value)) return 'company';
  if (/kalas|möhippa|svensexa|privat/.test(value)) return 'private';
  return 'other';
}

function inferOccasion(text = '', segment = 'other') {
  const value = text.toLowerCase();
  if (/möhippa/.test(value)) return 'hen_party';
  if (/svensexa/.test(value)) return 'stag_party';
  if (/kalas|födelsedag/.test(value)) return 'birthday';
  if (/kickoff|teambuilding|personaldag/.test(value)) return 'kickoff';
  if (/familjedag/.test(value)) return 'family_day';
  if (/skola|idrottsdag|fritids/.test(value)) return 'school_activity';
  if (/fotboll|lagaktivitet|säsongsavslutning/.test(value)) return 'football_activity';
  if (/föreningsdag|prova-på/.test(value)) return 'association_day';
  if (/event|festival/.test(value)) return 'event';

  const defaults = {
    school: 'school_activity',
    football: 'football_activity',
    association: 'association_day',
    company: 'kickoff',
    event: 'event',
    venue: 'event',
    private: 'birthday'
  };
  return defaults[segment] || 'other';
}

function inferLocation(city = '') {
  if (/malmö/i.test(city)) return 'malmo';
  return city ? 'skane' : 'unknown';
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function saveAndRender(message = '') {
  persist();
  render();
  if (message) showToast(message);
}

function dayDifference(dateString, fromString = todayISO()) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T12:00:00`);
  const from = new Date(`${fromString}T12:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(from.getTime())) return null;
  return Math.round((target - from) / 86400000);
}

function isAdultUnavailable(lead) {
  if (!['adult', 'both'].includes(lead.productType) || !lead.eventDate) return false;
  return lead.eventDate < ADULT_AVAILABLE_FROM;
}

function scoreLead(lead) {
  const reasons = [];
  let total = 0;

  const segmentPoints = SEGMENTS[lead.segment]?.points || 8;
  total += segmentPoints;
  reasons.push(`+${segmentPoints}: ${SEGMENTS[lead.segment]?.label || 'Målgruppen'} har tydlig aktivitetsmatchning.`);

  const occasionPoints = OCCASIONS[lead.occasion]?.points || 6;
  total += occasionPoints;
  reasons.push(`+${occasionPoints}: ${OCCASIONS[lead.occasion]?.label || 'Aktiviteten'} passar bumperballs.`);

  const productPoints = PRODUCTS[lead.productType]?.points || 5;
  total += productPoints;
  reasons.push(`+${productPoints}: Bolltyp och åldersgrupp är ${lead.productType === 'unknown' ? 'inte helt bedömda' : 'bedömda'}.`);

  const locationPoints = { malmo: 15, skane: 12, outside: 3, unknown: 5 }[lead.locationFit] || 5;
  total += locationPoints;
  reasons.push(`+${locationPoints}: Geografisk matchning ${locationLabel(lead.locationFit).toLowerCase()}.`);

  let contactPoints = 0;
  if (lead.email) contactPoints = 10;
  else if (lead.phone) contactPoints = 8;
  else if (lead.website) contactPoints = 5;
  total += contactPoints;
  reasons.push(`+${contactPoints}: ${contactPoints >= 8 ? 'Direkt kontaktväg finns.' : contactPoints ? 'Kontakt kan sökas via webbplats.' : 'Kontaktuppgift saknas.'}`);

  const intentPoints = { high: 15, medium: 10, low: 4, unknown: 5 }[lead.intent] || 5;
  total += intentPoints;
  reasons.push(`+${intentPoints}: ${intentLabel(lead.intent)}.`);

  const days = dayDifference(lead.eventDate);
  let timingPoints = 0;
  if (days == null) timingPoints = lead.recurring ? 5 : 2;
  else if (days < 0) timingPoints = 0;
  else if (days <= 14) timingPoints = 4;
  else if (days <= 90) timingPoints = 8;
  else if (days <= 240) timingPoints = 6;
  else timingPoints = 4;
  total += timingPoints;
  reasons.push(`+${timingPoints}: ${timingReason(lead, days)}.`);

  const participants = Number(lead.participants || 0);
  let groupPoints = 3;
  if (participants >= 6 && participants <= 30) groupPoints = 10;
  else if (participants > 30 && participants <= 60) groupPoints = 8;
  else if (participants >= 2 && participants < 6) groupPoints = 6;
  else if (participants > 60) groupPoints = 6;
  total += groupPoints;
  reasons.push(`+${groupPoints}: ${participants ? `${participants} deltagare ger ett ${participants > 30 ? 'rotationsbart' : 'hanterbart'} upplägg` : 'gruppstorleken behöver kontrolleras'}.`);

  if (lead.recurring) {
    total += 5;
    reasons.push('+5: Kan ge återkommande bokningar eller flera grupper.');
  }

  if (isAdultUnavailable(lead)) {
    total -= 25;
    reasons.unshift('−25: Eventdatumet ligger före vuxenbollarnas bokningsstart 1 september 2026.');
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(total)));
  return {
    total: finalScore,
    reasons,
    temperature: temperatureForScore(finalScore)
  };
}

function timingReason(lead, days) {
  if (days == null) return lead.recurring ? 'återkommande möjlighet utan låst datum' : 'eventdatum saknas';
  if (days < 0) return 'eventdatumet har passerat';
  if (days <= 14) return 'kort tid kvar till eventet';
  if (days <= 90) return 'bra bokningsfönster';
  if (days <= 240) return 'planerbart event framöver';
  return 'lång framförhållning';
}

function temperatureForScore(score) {
  if (score >= 90) return 'hot';
  if (score >= 65) return 'warm';
  return 'cold';
}

function temperatureLabel(temperature) {
  return { hot: 'Het lead', warm: 'Varm lead', cold: 'Kall lead' }[temperature] || 'Ej bedömd';
}

function intentLabel(value) {
  return {
    high: 'Tydligt behov eller aktuellt event',
    medium: 'Möjlig matchning',
    low: 'Svag eller långsiktig matchning',
    unknown: 'Köpsignal ej bedömd'
  }[value] || 'Köpsignal ej bedömd';
}

function locationLabel(value) {
  return {
    malmo: 'Malmö – mycket nära',
    skane: 'Skåne – bra matchning',
    outside: 'Utanför Skåne',
    unknown: 'ej bedömd'
  }[value] || 'ej bedömd';
}

function ballCountForParticipants(participants) {
  const size = Number(participants || 0);
  if (!size) return 6;
  if (size <= 4) return 2;
  if (size <= 8) return 4;
  if (size <= 14) return 6;
  if (size <= 20) return 8;
  if (size <= 26) return 10;
  return 12;
}

function recommendationFor(lead) {
  const participants = Number(lead.participants || 0);
  const count = ballCountForParticipants(participants);
  const rotation = participants > count ? ' med rotationsupplägg' : '';
  let packageText = '';

  if (lead.productType === 'children') {
    packageText = `${count} barnbollar${rotation}`;
  } else if (lead.productType === 'adult') {
    packageText = `${count} vuxenbollar${rotation}`;
  } else if (lead.productType === 'both') {
    const each = participants <= 12 ? 4 : participants <= 24 ? 6 : participants <= 36 ? 8 : participants <= 48 ? 10 : 12;
    packageText = `${each} barnbollar + ${each} vuxenbollar med grupper efter ålder`;
  } else {
    packageText = `${count} bollar preliminärt – bekräfta ålder och vikt först`;
  }

  return {
    packageText,
    productFacts: PRODUCTS[lead.productType]?.facts || PRODUCTS.unknown.facts,
    availabilityWarning: isAdultUnavailable(lead)
      ? 'Det angivna eventdatumet är före 1 september 2026. Vuxenbollar kan därför inte bokas till detta datum.'
      : '',
    occasionText: OCCASIONS[lead.occasion]?.label || 'Aktivitet'
  };
}

function nextActionFor(lead) {
  if (lead.status === 'won') return 'Bokningen är vunnen – säkra avtal, betalning och praktisk information.';
  if (lead.status === 'lost') return 'Ingen aktiv åtgärd. Spara orsaken i anteckningarna.';
  if (lead.followup) {
    const days = dayDifference(lead.followup);
    if (days < 0) return `Uppföljningen är ${Math.abs(days)} dagar sen.`;
    if (days === 0) return 'Följ upp i dag.';
    if (days === 1) return 'Följ upp i morgon.';
    return `Följ upp om ${days} dagar.`;
  }
  if (lead.status === 'new' && lead.email) return 'Skapa ett första mejlutkast och sätt uppföljningsdatum.';
  if (lead.status === 'contacted') return 'Sätt ett konkret uppföljningsdatum.';
  if (!lead.email && !lead.phone) return 'Hitta en offentlig kontaktväg innan bearbetning.';
  return 'Kvalificera datum, ålder och gruppstorlek.';
}

function filteredLeads() {
  const query = refs.search.value.trim().toLowerCase();
  const list = leads.filter((lead) => {
    const searchable = [
      lead.organization,
      lead.city,
      lead.contactName,
      lead.email,
      lead.phone,
      lead.opportunity,
      SEGMENTS[lead.segment]?.label,
      OCCASIONS[lead.occasion]?.label
    ].join(' ').toLowerCase();

    const productMatches = refs.product.value === 'all' || lead.productType === refs.product.value;
    const segmentMatches = refs.segment.value === 'all' || lead.segment === refs.segment.value;
    const statusMatches = refs.status.value === 'all' || lead.status === refs.status.value;
    const queryMatches = !query || searchable.includes(query);

    return productMatches && segmentMatches && statusMatches && queryMatches;
  });

  return list.sort((a, b) => {
    if (refs.sort.value === 'organization-asc') {
      return a.organization.localeCompare(b.organization, 'sv');
    }
    if (refs.sort.value === 'updated-desc') return b.updatedAt - a.updatedAt;
    if (refs.sort.value === 'followup-asc') return sortDates(a.followup, b.followup);
    if (refs.sort.value === 'event-asc') return sortDates(a.eventDate, b.eventDate);
    return scoreLead(b).total - scoreLead(a).total;
  });
}

function sortDates(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function render() {
  renderStats();
  renderTable();
  if (selectedId && leads.some((lead) => lead.id === selectedId)) fillDetail();
  else clearDetail();
}

function renderStats() {
  const active = leads.filter((lead) => !['won', 'lost'].includes(lead.status));
  const today = todayISO();
  $('totalCount').textContent = leads.length;
  $('hotCount').textContent = active.filter((lead) => scoreLead(lead).total >= 90).length;
  $('dueCount').textContent = active.filter((lead) => lead.followup && lead.followup <= today).length;
  $('childrenCount').textContent = active.filter((lead) => ['children', 'both'].includes(lead.productType)).length;
  $('adultCount').textContent = active.filter((lead) => ['adult', 'both'].includes(lead.productType)).length;
  $('wonCount').textContent = leads.filter((lead) => lead.status === 'won').length;
}

function renderTable() {
  const list = filteredLeads();
  refs.rows.innerHTML = list.map((lead) => {
    const score = scoreLead(lead);
    const recommendation = recommendationFor(lead);
    const followupClass = followupClassFor(lead.followup);
    const followupText = lead.followup ? formatDate(lead.followup) : 'Ej satt';

    return `
      <tr data-id="${escapeHtml(lead.id)}" class="${lead.id === selectedId ? 'selected' : ''}">
        <td class="organization-cell">
          <strong>${escapeHtml(lead.organization)}</strong>
          <small>${escapeHtml([lead.city, lead.contactName || lead.email].filter(Boolean).join(' · '))}</small>
        </td>
        <td><span class="segment-badge">${escapeHtml(SEGMENTS[lead.segment]?.short || 'Övrig')}</span></td>
        <td>
          <span class="product-badge">${escapeHtml(PRODUCTS[lead.productType]?.short || 'Ej bedömt')}</span>
          <small class="table-subtext">${escapeHtml(recommendation.packageText)}</small>
        </td>
        <td><span class="score ${score.temperature}">${score.total}</span></td>
        <td><span class="status">${escapeHtml(STATUSES[lead.status] || lead.status)}</span></td>
        <td class="${followupClass}">${escapeHtml(followupText)}</td>
      </tr>
    `;
  }).join('');

  refs.empty.hidden = list.length > 0;
  refs.rows.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.id;
      render();
    });
  });
}

function followupClassFor(date) {
  if (!date) return '';
  const days = dayDifference(date);
  if (days < 0) return 'followup-due';
  if (days === 0) return 'followup-today';
  return '';
}

function fillDetail() {
  const lead = leads.find((item) => item.id === selectedId);
  if (!lead) return clearDetail();

  const score = scoreLead(lead);
  const recommendation = recommendationFor(lead);

  $('detailOrganization').textContent = lead.organization;
  $('detailMeta').textContent = [lead.city, lead.contactName, lead.email].filter(Boolean).join(' · ') || 'Kontaktuppgifter saknas';
  $('detailContent').hidden = false;
  $('detailScore').textContent = score.total;
  $('detailScoreBox').className = `score-box ${score.temperature}`;
  $('detailTemperature').className = `priority-badge ${score.temperature}`;
  $('detailTemperature').textContent = temperatureLabel(score.temperature);
  $('detailNextAction').textContent = nextActionFor(lead);
  $('scoreReasons').innerHTML = score.reasons.slice(0, 6).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');

  $('detailSegment').textContent = SEGMENTS[lead.segment]?.label || 'Övrig';
  $('detailOccasion').textContent = [
    OCCASIONS[lead.occasion]?.label,
    lead.eventDate ? formatDate(lead.eventDate) : '',
    lead.participants ? `${lead.participants} deltagare` : ''
  ].filter(Boolean).join(' · ');
  $('detailRecommendation').textContent = recommendation.packageText;
  $('detailProduct').textContent = recommendation.productFacts;
  $('availabilityRow').hidden = !recommendation.availabilityWarning;
  $('detailAvailability').textContent = recommendation.availabilityWarning;
  $('detailContact').textContent = [lead.contactName, lead.email, lead.phone].filter(Boolean).join(' · ') || 'Saknas';
  $('detailWebsite').innerHTML = externalLinkHtml(lead.website, 'Öppna webbplats');
  $('detailSource').innerHTML = sourceHtml(lead);

  $('detailStatus').innerHTML = Object.entries(STATUSES)
    .map(([value, label]) => `<option value="${value}" ${value === lead.status ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
  $('detailFollowup').value = lead.followup || '';
  $('detailNotes').value = lead.notes || '';
  $('subjectOutput').value = '';
  $('messageOutput').value = '';
  updateMailLink(lead);
}

function clearDetail() {
  selectedId = null;
  $('detailOrganization').textContent = 'Välj en organisation';
  $('detailMeta').textContent = 'Klicka på en rad för att se matchning, rekommendation och kontaktutkast.';
  $('detailContent').hidden = true;
}

function externalLinkHtml(value, label) {
  const url = safeUrl(value);
  if (!url) return 'Saknas';
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function sourceHtml(lead) {
  const label = SOURCES[lead.sourceType] || 'Annan';
  const url = safeUrl(lead.sourceUrl);
  const checked = lead.sourceCheckedAt ? ` · kontrollerad ${formatDate(lead.sourceCheckedAt)}` : '';
  if (!url) return escapeHtml(`${label}${checked}`);
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${escapeHtml(checked)}`;
}

function safeUrl(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function updateSelected(patch, message = '') {
  const index = leads.findIndex((lead) => lead.id === selectedId);
  if (index < 0) return;
  leads[index] = normalizeLead({
    ...leads[index],
    ...patch,
    updatedAt: Date.now()
  });
  saveAndRender(message);
}

function openLeadDialog(lead = null, presets = {}) {
  refs.form.reset();
  editingId = lead?.id || null;
  $('dialogTitle').textContent = editingId ? 'Redigera bumperball-lead' : 'Ny bumperball-lead';

  const values = lead || {
    segment: presets.segment || 'school',
    city: presets.city || 'Malmö',
    occasion: presets.occasion || 'school_activity',
    productType: presets.productType || OCCASIONS[presets.occasion]?.suggestedProduct || 'children',
    intent: 'medium',
    locationFit: /malmö/i.test(presets.city || '') ? 'malmo' : 'skane',
    sourceType: 'google',
    recurring: false
  };

  Object.entries(values).forEach(([key, value]) => {
    const field = refs.form.elements.namedItem(key);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  });

  refs.dialog.showModal();
}

function formToLead() {
  const data = new FormData(refs.form);
  const current = editingId ? leads.find((lead) => lead.id === editingId) : null;

  return normalizeLead({
    ...current,
    id: editingId || uid(),
    organization: data.get('organization'),
    segment: data.get('segment'),
    city: data.get('city'),
    contactName: data.get('contactName'),
    email: data.get('email'),
    phone: data.get('phone'),
    website: data.get('website'),
    sourceUrl: data.get('sourceUrl'),
    sourceType: data.get('sourceType'),
    sourceCheckedAt: todayISO(),
    occasion: data.get('occasion'),
    productType: data.get('productType'),
    participants: data.get('participants'),
    eventDate: data.get('eventDate'),
    intent: data.get('intent'),
    locationFit: data.get('locationFit'),
    recurring: data.get('recurring') === 'on',
    opportunity: data.get('opportunity'),
    notes: data.get('notes'),
    status: current?.status || 'new',
    followup: current?.followup || '',
    createdAt: current?.createdAt || Date.now(),
    updatedAt: Date.now()
  });
}

function duplicateKey(lead) {
  const email = lead.email.trim().toLowerCase();
  if (email) return `email:${email}`;

  const website = safeUrl(lead.website);
  if (website) {
    try {
      return `web:${new URL(website).hostname.replace(/^www\./, '')}`;
    } catch {
      // Fallback below.
    }
  }

  return `org:${normalizeText(lead.organization)}|${normalizeText(lead.city)}`;
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildMessage(lead, type) {
  const recommendation = recommendationFor(lead);
  const segment = SEGMENTS[lead.segment] || SEGMENTS.other;
  const occasion = OCCASIONS[lead.occasion]?.label || 'gruppaktivitet';
  const firstName = lead.contactName ? lead.contactName.split(/\s+/)[0] : '';
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,';
  const participantLine = lead.participants
    ? `För en grupp på ungefär ${lead.participants} deltagare skulle ett första förslag vara ${recommendation.packageText}.`
    : `Ett lämpligt upplägg kan anpassas efter deltagarnas ålder, vikt och gruppstorlek.`;
  const dateLine = lead.eventDate ? `Jag såg ett möjligt datum den ${formatDate(lead.eventDate)}. ` : '';

  if (type === 'followup') {
    return {
      subject: `Uppföljning: bumperballs för ${lead.organization}`,
      body: `${greeting}\n\nJag följer upp mitt förslag om bumperballs för ${occasion.toLowerCase()} hos ${lead.organization}.\n\n${participantLine}\n\nBarnbollarna passar 7–12 år, max 60 kg. Vuxenbollarna passar från 12 år, max 90 kg, och är bokningsbara från 1 september 2026.\n\nÄr aktiviteten relevant för er, eller ska jag återkomma vid ett senare tillfälle?\n\nVänliga hälsningar\nErica Nordlöf\nOffroad Bumpis\noffroadbumpis.se`
    };
  }

  if (type === 'event') {
    return {
      subject: `Bumperballs till ${occasion.toLowerCase()}${lead.eventDate ? ` ${formatDate(lead.eventDate)}` : ''}`,
      body: `${greeting}\n\n${dateLine}Offroad Bumpis hyr ut bumperballs till kalas, skolor, föreningar, lag och företag i Skåne.\n\n${participantLine}\n\n${recommendation.productFacts}\n\nBollarna kan användas på gräs, konstgräs eller i idrottshall. Jag skickar gärna ett konkret upplägg med antal bollar, pris och praktisk information.\n\nVill ni att jag tar fram ett förslag?\n\nVänliga hälsningar\nErica Nordlöf\nOffroad Bumpis\noffroadbumpis.se`
    };
  }

  return {
    subject: `Förslag: ${occasion.toLowerCase()} med bumperballs för ${lead.organization}`,
    body: `${greeting}\n\nJag kontaktar er eftersom ${segment.angle}.\n\nOffroad Bumpis i Malmö hyr ut bumperballs till barnkalas, skolor, fotbollslag, föreningar, företag och andra grupper i Skåne. ${recommendation.productFacts}\n\n${participantLine}\n\nBollarna fungerar på gräs, konstgräs och i idrottshall. Jag kan skicka ett enkelt förslag med antal bollar, pris och möjliga tider utan att boka in ett möte först.\n\nÄr det relevant att jag skickar ett konkret upplägg?\n\nVänliga hälsningar\nErica Nordlöf\nOffroad Bumpis\noffroadbumpis.se`
  };
}

function updateMailLink(lead = leads.find((item) => item.id === selectedId)) {
  const button = $('openMailBtn');
  const subject = $('subjectOutput').value.trim();
  const body = $('messageOutput').value.trim();

  if (!lead?.email || (!subject && !body)) {
    button.href = '#';
    button.classList.add('disabled');
    button.setAttribute('aria-disabled', 'true');
    return;
  }

  button.href = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  button.classList.remove('disabled');
  button.setAttribute('aria-disabled', 'false');
}

function openOutreachDialog() {
  const lead = leads.find((item) => item.id === selectedId);
  if (!lead) return showToast('Välj en lead först.');

  $('outreachOrganization').textContent = lead.organization;
  $('outreachMeta').textContent = [
    SEGMENTS[lead.segment]?.label,
    OCCASIONS[lead.occasion]?.label,
    lead.email || 'E-post saknas'
  ].filter(Boolean).join(' · ');

  const dialog = $('outreachDialog');
  if (!dialog.open) dialog.showModal();
  generateOutreach();
  requestAnimationFrame(() => $('subjectOutput').focus());
}

function generateOutreach() {
  const lead = leads.find((item) => item.id === selectedId);
  if (!lead) return;
  const output = buildMessage(lead, $('messageType').value);
  $('subjectOutput').value = output.subject;
  $('messageOutput').value = output.body;
  updateMailLink(lead);
}

async function copyText(value, successMessage) {
  if (!value) return showToast('Det finns inget att kopiera.');
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showToast(successMessage);
}

function buildSearches() {
  const city = $('discoverCity').value.trim() || 'Skåne';
  const segmentKey = $('discoverSegment').value;
  const occasionKey = $('discoverOccasion').value;
  const segment = SEGMENTS[segmentKey] || SEGMENTS.other;
  const occasion = OCCASIONS[occasionKey]?.label || 'aktivitet';
  const terms = segment.searches;

  currentSearches = [
    {
      title: `${segment.label} i ${city}`,
      description: 'Bred sökning efter möjliga kunder.',
      query: `${terms[0]} ${city} kontakt`,
      url: googleSearchUrl(`${terms[0]} ${city} kontakt`)
    },
    {
      title: 'Sök på Google Maps',
      description: 'Bra för lokala organisationer och offentliga kontaktuppgifter.',
      query: `${terms[1]} ${city}`,
      url: googleMapsUrl(`${terms[1]} ${city}`)
    },
    {
      title: `Aktörer som arrangerar ${occasion.toLowerCase()}`,
      description: 'Hitta organisationer som redan erbjuder eller planerar liknande aktiviteter.',
      query: `"${occasion}" ${city} kontakt`,
      url: googleSearchUrl(`"${occasion}" ${city} kontakt`)
    },
    {
      title: 'Kontakt- och aktivitetssidor',
      description: 'Sök direkt efter relevanta sidor på svenska webbplatser.',
      query: `site:.se ${city} ${terms[2]} (kontakt OR aktiviteter OR event)`,
      url: googleSearchUrl(`site:.se ${city} ${terms[2]} kontakt aktiviteter event`)
    }
  ];

  renderSearchCards();
  showToast('Fyra sökvägar skapades.');
}

function renderSearchCards() {
  $('searchCards').innerHTML = currentSearches.map((item) => `
    <article class="search-card">
      <p class="eyebrow">Leadspaning</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="muted">${escapeHtml(item.description)}</p>
      <code>${escapeHtml(item.query)}</code>
      <a class="button secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Öppna sökning</a>
    </article>
  `).join('');
}

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function googleMapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const keys = [
    'organization', 'segment', 'city', 'contactName', 'email', 'phone', 'website', 'sourceUrl',
    'sourceType', 'sourceCheckedAt', 'occasion', 'productType', 'participants', 'eventDate',
    'intent', 'locationFit', 'recurring', 'opportunity', 'status', 'followup', 'notes'
  ];

  const rows = [
    keys.join(','),
    ...leads.map((lead) => keys.map((key) => csvEscape(lead[key])).join(','))
  ];

  const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `bumperball-leads-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${leads.length} leads exporterades.`);
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCsv(String(reader.result || ''));
      if (rows.length < 2) return showToast('CSV-filen saknar datarader.');

      const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
      const existingKeys = new Set(leads.map(duplicateKey));
      let skipped = 0;

      const imported = rows.slice(1)
        .map((columns) => Object.fromEntries(headers.map((header, index) => [header, columns[index] || ''])))
        .map(mapImportedRow)
        .filter((lead) => {
          if (!lead.organization) return false;
          const key = duplicateKey(lead);
          if (existingKeys.has(key)) {
            skipped += 1;
            return false;
          }
          existingKeys.add(key);
          return true;
        });

      leads = [...imported, ...leads];
      saveAndRender(`${imported.length} leads importerades${skipped ? `, ${skipped} dubbletter hoppades över` : ''}.`);
    } catch (error) {
      console.error(error);
      showToast('CSV-filen kunde inte läsas. Kontrollera rubriker och format.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function mapImportedRow(row) {
  const organization = row.organization || row.company || row.name || '';
  const descriptiveText = `${row.segment || ''} ${row.industry || ''} ${row.opportunity || row.need || ''}`;
  const segment = SEGMENTS[row.segment] ? row.segment : inferSegment(descriptiveText);
  const occasion = OCCASIONS[row.occasion] ? row.occasion : inferOccasion(descriptiveText, segment);

  return normalizeLead({
    ...row,
    id: uid(),
    organization,
    segment,
    occasion,
    productType: PRODUCTS[row.productType] ? row.productType : OCCASIONS[occasion]?.suggestedProduct,
    opportunity: row.opportunity || row.need || '',
    recurring: ['true', '1', 'ja', 'yes'].includes(String(row.recurring).toLowerCase()),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setActiveView(viewId) {
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.hidden = panel.id !== viewId;
  });
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewId);
  });
}

['searchInput', 'segmentFilter', 'productFilter', 'statusFilter', 'sortSelect'].forEach((id) => {
  $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', render);
});

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
});

$('addLeadBtn').addEventListener('click', () => openLeadDialog());

$('saveLeadBtn').addEventListener('click', (event) => {
  event.preventDefault();
  if (!refs.form.reportValidity()) return;

  const nextLead = formToLead();
  const nextKey = duplicateKey(nextLead);
  const duplicate = leads.find((lead) => lead.id !== nextLead.id && duplicateKey(lead) === nextKey);
  if (duplicate && !confirm(`Det finns redan en lead som liknar ${duplicate.organization}. Spara ändå?`)) return;

  if (editingId) {
    const index = leads.findIndex((lead) => lead.id === editingId);
    if (index >= 0) leads[index] = nextLead;
  } else {
    leads.unshift(nextLead);
  }

  selectedId = nextLead.id;
  refs.dialog.close();
  editingId = null;
  saveAndRender('Leaden sparades.');
});

$('editLeadBtn').addEventListener('click', () => {
  const lead = leads.find((item) => item.id === selectedId);
  if (lead) openLeadDialog(lead);
});

$('deleteLeadBtn').addEventListener('click', () => {
  const lead = leads.find((item) => item.id === selectedId);
  if (!lead || !confirm(`Ta bort ${lead.organization}?`)) return;
  leads = leads.filter((item) => item.id !== selectedId);
  selectedId = null;
  saveAndRender('Leaden togs bort.');
});

$('detailStatus').addEventListener('change', (event) => updateSelected({ status: event.target.value }, 'Status uppdaterad.'));
$('detailFollowup').addEventListener('change', (event) => updateSelected({ followup: event.target.value }, 'Uppföljning uppdaterad.'));
$('detailNotes').addEventListener('change', (event) => updateSelected({ notes: event.target.value }, 'Anteckningen sparades.'));

$('openOutreachBtn').addEventListener('click', openOutreachDialog);
$('generateMessageBtn').addEventListener('click', generateOutreach);
$('messageType').addEventListener('change', generateOutreach);
$('subjectOutput').addEventListener('input', () => updateMailLink());
$('messageOutput').addEventListener('input', () => updateMailLink());
$('copySubjectBtn').addEventListener('click', () => copyText($('subjectOutput').value, 'Ämnesraden kopierades.'));
$('copyMessageBtn').addEventListener('click', () => copyText($('messageOutput').value, 'Meddelandet kopierades.'));
$('openMailBtn').addEventListener('click', (event) => {
  if ($('openMailBtn').getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    showToast('Lägg till en e-postadress på leaden för att öppna mejlet.');
  }
});

$('exportBtn').addEventListener('click', exportCsv);
$('csvInput').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
  event.target.value = '';
});

$('resetDemoBtn').addEventListener('click', () => {
  if (!confirm('Ersätta alla nuvarande leads med exempeldata? Exportera först om du vill spara dem.')) return;
  leads = cloneDemoLeads();
  selectedId = null;
  saveAndRender('Exempeldata återställdes.');
});

$('generateSearchesBtn').addEventListener('click', buildSearches);
$('copySearchesBtn').addEventListener('click', () => {
  const text = currentSearches.map((item) => item.query).join('\n');
  copyText(text, 'Sökfraserna kopierades.');
});
$('newLeadFromSearchBtn').addEventListener('click', () => {
  const segment = $('discoverSegment').value;
  const city = $('discoverCity').value.trim();
  const occasion = $('discoverOccasion').value;
  openLeadDialog(null, {
    segment,
    city,
    occasion,
    productType: OCCASIONS[occasion]?.suggestedProduct || 'unknown'
  });
});

buildSearches();
render();
