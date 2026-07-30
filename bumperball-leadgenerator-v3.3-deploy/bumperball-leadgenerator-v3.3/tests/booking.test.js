import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffPayloadBase, estimatePrice } from '../src/pricing.js';

test('räknar barnbollspris', () => {
  assert.deepEqual(estimatePrice({ product_type: 'children', participants: 18 }), {
    amount: 1800, count: 8, currency: 'SEK'
  });
});

test('bygger bokningsunderlag med företagsuppgifter', () => {
  const payload = buildHandoffPayloadBase({
    id: '00000000-0000-0000-0000-000000000001',
    organization: 'Testskolan', contact_name: 'Anna', email: 'anna@example.se', phone: '', city: 'Malmö',
    occasion: 'school_activity', event_date: null, participants: 20, product_type: 'children',
    source_type: 'manual', source_url: '', notes: '', opportunity: ''
  }, 'quote', { legalName: 'Nordlöf Nordic', brandName: 'Offroad Bumpis', email: 'kontakt@offroadbumpis.se', phone: '0793442520' });
  assert.equal(payload.business.legalName, 'Nordlöf Nordic');
  assert.equal(payload.business.phone, '0793442520');
  assert.equal(payload.event.estimatedPrice, 1800);
});
