import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSkolverketRows } from '../src/skolverket.js';

test('läser JSON:API-lista från Skolverket', () => {
  const data = [{ id: '123', attributes: { schoolUnitName: 'Testskolan' } }];
  assert.deepEqual(extractSkolverketRows({ data }), data);
});

test('läser HAL-lista från Skolverket', () => {
  const data = [{ schoolUnitCode: '456', name: 'Exempelskolan' }];
  assert.deepEqual(extractSkolverketRows({ _embedded: { schoolUnits: data } }), data);
});

test('läser omslagen data.schoolUnits från Skolverket', () => {
  const rows = [{ schoolUnitCode: '789', schoolUnitName: 'Skåneskolan' }];
  assert.deepEqual(extractSkolverketRows({ data: { schoolUnits: rows } }), rows);
});
