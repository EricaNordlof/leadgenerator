import test from 'node:test';
import assert from 'node:assert/strict';
import { ballCountForParticipants, recommendationFor, scoreLead } from '../src/lead.js';

test('väljer rätt paketstorlek', () => {
  assert.equal(ballCountForParticipants(4), 2);
  assert.equal(ballCountForParticipants(18), 8);
  assert.equal(ballCountForParticipants(40), 12);
});

test('rekommenderar barnbollar med rotation', () => {
  const result = recommendationFor({ product_type: 'children', participants: 18 });
  assert.match(result.packageText, /8 barnbollar/);
  assert.match(result.packageText, /rotation/);
});

test('straffar vuxenevent före 1 september 2026', () => {
  const base = {
    segment: 'company', occasion: 'kickoff', product_type: 'adult', city: 'Malmö',
    email: 'hr@example.se', intent: 'high', participants: 20, recurring: false
  };
  const before = scoreLead({ ...base, event_date: '2026-08-20' });
  const after = scoreLead({ ...base, event_date: '2026-09-20' });
  assert.ok(after.total > before.total);
  assert.match(before.reasons[0], /−25/);
});
