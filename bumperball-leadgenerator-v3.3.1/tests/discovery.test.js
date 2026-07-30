import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSkolverketDetail, extractSkolverketRows } from '../src/skolverket.js';
import { bboxString, rotateSlice, splitBbox } from '../src/discovery-utils.js';

test('läser Skolverkets aktuella lista från data.attributes', () => {
  const rows = [{ schoolUnitCode: '50194424', name: 'Pauliskolan', status: 'AKTIV' }];
  assert.deepEqual(extractSkolverketRows({ data: { type: 'schoolunit', attributes: rows } }), rows);
});

test('läser äldre JSON:API-lista från data-array', () => {
  const rows = [{ id: '123', attributes: { schoolUnitName: 'Testskolan' } }];
  assert.deepEqual(extractSkolverketRows({ data: rows }), rows);
});

test('läser HAL-lista från Skolverket', () => {
  const rows = [{ schoolUnitCode: '456', name: 'Exempelskolan' }];
  assert.deepEqual(extractSkolverketRows({ _embedded: { schoolUnits: rows } }), rows);
});

test('packar upp skolenhetsdetalj från data.attributes', () => {
  const payload = {
    data: {
      id: '50194424',
      type: 'schoolunit',
      attributes: { name: 'Pauliskolan', municipality: { name: 'Malmö' } }
    },
    included: [{ type: 'organizer', attributes: { name: 'Malmö stad' } }]
  };
  const detail = extractSkolverketDetail(payload);
  assert.equal(detail.id, '50194424');
  assert.equal(detail.name, 'Pauliskolan');
  assert.equal(detail.municipality.name, 'Malmö');
  assert.equal(detail.included[0].type, 'organizer');
});

test('delar Skåne-boxen i sex mindre Overpass-områden', () => {
  const tiles = splitBbox('55.30,12.35,56.50,14.75', 6);
  assert.equal(tiles.length, 6);
  assert.equal(bboxString(tiles[0]), '55.300000,12.350000,55.900000,13.150000');
  assert.equal(bboxString(tiles.at(-1)), '55.900000,13.950000,56.500000,14.750000');
});

test('roterar Skolverkets detaljgranskning mellan dagarna', () => {
  assert.deepEqual(rotateSlice(['a', 'b', 'c', 'd'], 3, 3), ['d', 'a', 'b']);
});
