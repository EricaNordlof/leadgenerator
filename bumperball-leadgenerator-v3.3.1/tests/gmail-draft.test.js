import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraftContent } from '../src/draft-content.js';

test('använder redigerad ämnesrad och meddelandetext', () => {
  const result = normalizeDraftContent(
    { subject: 'Mallämne', body: 'Malltext' },
    { subject: '  Eget ämne  ', body: '  Egen text\r\nrad två  ' }
  );
  assert.deepEqual(result, { subject: 'Eget ämne', body: 'Egen text\nrad två' });
});

test('förhindrar radbrytning i ämnesraden', () => {
  const result = normalizeDraftContent(
    { subject: 'Mallämne', body: 'Malltext' },
    { subject: 'Ämne\r\nBcc: annan@example.se', body: 'Text' }
  );
  assert.equal(result.subject, 'Ämne Bcc: annan@example.se');
});

test('använder mallen när ingen egen text anges', () => {
  const result = normalizeDraftContent(
    { subject: 'Mallämne', body: 'Malltext' },
    { subject: '', body: '' }
  );
  assert.deepEqual(result, { subject: 'Mallämne', body: 'Malltext' });
});
