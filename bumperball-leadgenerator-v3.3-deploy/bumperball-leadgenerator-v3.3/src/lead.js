const SEGMENT_POINTS = {
  school: 20,
  football: 20,
  association: 18,
  company: 15,
  event: 20,
  venue: 17,
  private: 13,
  other: 8
};

const OCCASION_POINTS = {
  school_activity: 15,
  birthday: 15,
  football_activity: 15,
  association_day: 14,
  kickoff: 15,
  family_day: 15,
  hen_party: 15,
  stag_party: 15,
  event: 14,
  other: 6
};

export const PRODUCT_FACTS = {
  children: 'Barnbollar för 7–12 år, max 60 kg. 12 bollar finns bokningsbara nu.',
  adult: 'Vuxenbollar från 12 år, max 90 kg. 12 bollar är bokningsbara från 1 september 2026.',
  both: 'Kombinationsupplägg med barnbollar 7–12 år, max 60 kg, och vuxenbollar från 12 år, max 90 kg.',
  unknown: 'Ålder, vikt och gruppstorlek behöver kontrolleras innan rätt bolltyp väljs.'
};

export function productForOccasion(occasion) {
  return {
    school_activity: 'children',
    birthday: 'children',
    football_activity: 'children',
    association_day: 'both',
    kickoff: 'adult',
    family_day: 'both',
    hen_party: 'adult',
    stag_party: 'adult',
    event: 'both'
  }[occasion] || 'unknown';
}

export function inferLocation(city = '') {
  const value = String(city).toLowerCase();
  if (value.includes('malmö')) return 'malmo';
  if (value) return 'skane';
  return 'unknown';
}

export function ballCountForParticipants(participants) {
  const size = Number(participants || 0);
  if (!size) return 6;
  if (size <= 4) return 2;
  if (size <= 8) return 4;
  if (size <= 14) return 6;
  if (size <= 20) return 8;
  if (size <= 26) return 10;
  return 12;
}

export function recommendationFor(lead) {
  const count = ballCountForParticipants(lead.participants);
  const participants = Number(lead.participants || 0);
  const rotation = participants > count ? ' med rotationsupplägg' : '';
  let packageText;

  if (lead.product_type === 'children' || lead.productType === 'children') {
    packageText = `${count} barnbollar${rotation}`;
  } else if (lead.product_type === 'adult' || lead.productType === 'adult') {
    packageText = `${count} vuxenbollar${rotation}`;
  } else if (lead.product_type === 'both' || lead.productType === 'both') {
    const each = participants <= 12 ? 4 : participants <= 24 ? 6 : participants <= 36 ? 8 : participants <= 48 ? 10 : 12;
    packageText = `${each} barnbollar + ${each} vuxenbollar med grupper efter ålder`;
  } else {
    packageText = `${count} bollar preliminärt – bekräfta ålder och vikt först`;
  }

  return { count, packageText };
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - localToday) / 86_400_000);
}

export function scoreLead(lead) {
  const segment = lead.segment || 'other';
  const occasion = lead.occasion || 'other';
  const productType = lead.product_type || lead.productType || 'unknown';
  const locationFit = lead.location_fit || lead.locationFit || inferLocation(lead.city);
  const reasons = [];
  let total = 0;

  const segmentPoints = SEGMENT_POINTS[segment] || 8;
  total += segmentPoints;
  reasons.push(`+${segmentPoints}: målgruppen har tydlig matchning mot en gruppaktivitet.`);

  const occasionPoints = OCCASION_POINTS[occasion] || 6;
  total += occasionPoints;
  reasons.push(`+${occasionPoints}: aktiviteten passar bumperballs.`);

  const productPoints = productType === 'unknown' ? 5 : 15;
  total += productPoints;
  reasons.push(`+${productPoints}: ${productType === 'unknown' ? 'bolltyp behöver kvalificeras' : 'bolltyp och målgrupp är bedömda'}.`);

  const locationPoints = { malmo: 15, skane: 12, outside: 2, unknown: 5 }[locationFit] || 5;
  total += locationPoints;
  reasons.push(`+${locationPoints}: geografisk matchning.`);

  const contactPoints = lead.email ? 10 : lead.phone ? 8 : lead.website ? 5 : 0;
  total += contactPoints;
  reasons.push(`+${contactPoints}: ${contactPoints >= 8 ? 'direkt kontaktväg finns' : contactPoints ? 'kontakt kan sökas via webbplats' : 'kontaktuppgift saknas'}.`);

  const intent = lead.intent || 'unknown';
  const intentPoints = { high: 15, medium: 10, low: 4, unknown: 5 }[intent] || 5;
  total += intentPoints;
  reasons.push(`+${intentPoints}: köpsignal eller aktivitetsbehov.`);

  const days = daysUntil(lead.event_date || lead.eventDate);
  let timingPoints = 2;
  if (days != null && days >= 14 && days <= 120) timingPoints = 8;
  else if (days != null && days >= 0 && days < 14) timingPoints = 4;
  else if (days != null && days > 120) timingPoints = 5;
  else if (lead.recurring) timingPoints = 5;
  total += timingPoints;
  reasons.push(`+${timingPoints}: tidsmässig möjlighet.`);

  const participants = Number(lead.participants || 0);
  let groupPoints = 3;
  if (participants >= 6 && participants <= 30) groupPoints = 10;
  else if (participants > 30 && participants <= 60) groupPoints = 8;
  else if (participants >= 2) groupPoints = 6;
  total += groupPoints;
  reasons.push(`+${groupPoints}: ${participants ? `${participants} deltagare ger ett genomförbart upplägg` : 'gruppstorlek behöver kontrolleras'}.`);

  if (lead.recurring) {
    total += 5;
    reasons.push('+5: möjlighet till återkommande bokningar.');
  }

  const eventDate = String(lead.event_date || lead.eventDate || '').slice(0, 10);
  if (['adult', 'both'].includes(productType) && eventDate && eventDate < '2026-09-01') {
    total -= 25;
    reasons.unshift('−25: eventdatumet ligger före vuxenbollarnas bokningsstart 1 september 2026.');
  }

  return {
    total: Math.max(0, Math.min(100, Math.round(total))),
    reasons
  };
}

export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildDedupeKey(lead) {
  if (lead.source_external_id || lead.sourceExternalId) {
    return `${lead.source_type || lead.sourceType}:${lead.source_external_id || lead.sourceExternalId}`;
  }
  if (lead.email) return `email:${String(lead.email).trim().toLowerCase()}`;
  if (lead.website) {
    try {
      const url = new URL(/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`);
      return `web:${url.hostname.replace(/^www\./, '')}`;
    } catch {}
  }
  return `org:${normalizeText(lead.organization)}|${normalizeText(lead.city)}`;
}
