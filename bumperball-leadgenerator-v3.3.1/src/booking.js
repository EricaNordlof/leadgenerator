import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { buildHandoffPayloadBase } from './pricing.js';

export function buildHandoffPayload(lead, mode) {
  return buildHandoffPayloadBase(lead, mode, {
    legalName: config.business.legalName,
    brandName: config.business.brandName,
    email: config.business.email,
    phone: config.business.phone
  });
}

function prefilledBookingUrl(payload) {
  const url = new URL(config.booking.appUrl);
  url.searchParams.set('source', 'leadgenerator');
  url.searchParams.set('leadId', payload.lead.id);
  url.searchParams.set('organization', payload.customer.organization);
  url.searchParams.set('contactName', payload.customer.contactName);
  url.searchParams.set('email', payload.customer.email);
  url.searchParams.set('phone', payload.customer.phone);
  url.searchParams.set('city', payload.customer.city);
  url.searchParams.set('occasion', payload.event.occasion);
  url.searchParams.set('productType', payload.event.productType);
  if (payload.event.date) url.searchParams.set('date', payload.event.date);
  if (payload.event.participants) url.searchParams.set('participants', String(payload.event.participants));
  return url.toString();
}

async function postWebhook(payload) {
  if (!config.booking.webhookUrl) return null;
  const body = JSON.stringify(payload);
  const signature = config.booking.webhookSecret
    ? crypto.createHmac('sha256', config.booking.webhookSecret).update(body).digest('hex')
    : '';
  const response = await fetch(config.booking.webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'OffroadBumpisLeadgenerator/3.0',
      ...(signature ? { 'x-offroadbumpis-signature': signature } : {})
    },
    body,
    signal: AbortSignal.timeout(20_000)
  });
  const responseText = await response.text();
  let parsed = null;
  try { parsed = responseText ? JSON.parse(responseText) : null; } catch { parsed = { text: responseText }; }
  if (!response.ok) throw new Error(`Bokningswebhook svarade ${response.status}.`);
  return parsed;
}

export async function createHandoff({ lead, userId, mode }) {
  const payload = buildHandoffPayload(lead, mode);
  let webhookResponse = null;
  let status = 'created';
  let externalId = '';
  let externalUrl = prefilledBookingUrl(payload);

  if (config.booking.webhookUrl) {
    webhookResponse = await postWebhook(payload);
    status = 'delivered';
    externalId = String(webhookResponse?.id || webhookResponse?.bookingId || webhookResponse?.quoteId || '');
    externalUrl = String(webhookResponse?.url || webhookResponse?.externalUrl || externalUrl);
  }

  const result = await query(
    `INSERT INTO booking_handoffs
       (lead_id, user_id, handoff_type, status, payload, external_id, external_url, response_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
     RETURNING *`,
    [lead.id, userId, mode, status, JSON.stringify(payload), externalId, externalUrl, JSON.stringify(webhookResponse)]
  );

  if (mode === 'booking') {
    await query("UPDATE leads SET status = 'won', updated_at = now() WHERE id = $1", [lead.id]);
  } else {
    await query("UPDATE leads SET status = 'quoted', updated_at = now() WHERE id = $1", [lead.id]);
  }

  return result.rows[0];
}
