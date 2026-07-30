import { ballCountForParticipants, recommendationFor } from './lead.js';

const CHILDREN_PRICES = { 2: 600, 4: 1100, 6: 1500, 8: 1800, 10: 2000, 12: 2200 };
const ADULT_PRICES = { 2: 700, 4: 1300, 6: 1900, 8: 2500, 10: 3000, 12: 3500 };

function nearestPackageCount(value) {
  const allowed = [2, 4, 6, 8, 10, 12];
  return allowed.find((count) => value <= count) || 12;
}

export function estimatePrice(lead) {
  const count = nearestPackageCount(ballCountForParticipants(lead.participants));
  const type = lead.product_type || lead.productType || 'unknown';
  if (type === 'children') return { amount: CHILDREN_PRICES[count], count, currency: 'SEK' };
  if (type === 'adult') return { amount: ADULT_PRICES[count], count, currency: 'SEK' };
  if (type === 'both') return {
    amount: CHILDREN_PRICES[count] + ADULT_PRICES[count],
    count,
    currency: 'SEK'
  };
  return { amount: null, count, currency: 'SEK' };
}

export function buildHandoffPayloadBase(lead, mode, business) {
  const estimate = estimatePrice(lead);
  const recommendation = recommendationFor(lead);
  return {
    version: 1,
    mode,
    createdAt: new Date().toISOString(),
    business,
    customer: {
      organization: lead.organization,
      contactName: lead.contact_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      city: lead.city || ''
    },
    event: {
      occasion: lead.occasion,
      date: lead.event_date || null,
      participants: lead.participants || null,
      productType: lead.product_type,
      recommendedPackage: recommendation.packageText,
      estimatedPrice: estimate.amount,
      currency: estimate.currency
    },
    lead: {
      id: lead.id,
      sourceType: lead.source_type,
      sourceUrl: lead.source_url,
      notes: lead.notes || '',
      opportunity: lead.opportunity || ''
    }
  };
}
