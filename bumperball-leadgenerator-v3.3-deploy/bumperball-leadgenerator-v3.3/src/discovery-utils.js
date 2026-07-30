export function normalizeSwedish(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseBbox(value) {
  const parts = String(value || '').split(',').map((item) => Number(item.trim()));
  if (parts.length !== 4 || parts.some((number) => !Number.isFinite(number))) {
    throw new Error('DISCOVERY_BBOX måste vara south,west,north,east.');
  }
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) throw new Error('DISCOVERY_BBOX har ogiltiga koordinater.');
  return { south, west, north, east };
}

export function splitBbox(value, requestedTiles = 6) {
  const bbox = typeof value === 'string' ? parseBbox(value) : value;
  const count = Math.max(1, Number(requestedTiles) || 1);
  const rows = Math.max(1, Math.floor(Math.sqrt(count)));
  const columns = Math.max(1, Math.ceil(count / rows));
  const latStep = (bbox.north - bbox.south) / rows;
  const lonStep = (bbox.east - bbox.west) / columns;
  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        south: bbox.south + row * latStep,
        west: bbox.west + column * lonStep,
        north: row === rows - 1 ? bbox.north : bbox.south + (row + 1) * latStep,
        east: column === columns - 1 ? bbox.east : bbox.west + (column + 1) * lonStep
      });
    }
  }

  return tiles;
}

export function bboxString(tile) {
  return [tile.south, tile.west, tile.north, tile.east]
    .map((number) => Number(number).toFixed(6))
    .join(',');
}

export function rotateSlice(items, start, count) {
  if (!items.length || count <= 0) return [];
  const limit = Math.min(count, items.length);
  const normalizedStart = ((Number(start) || 0) % items.length + items.length) % items.length;
  return Array.from({ length: limit }, (_, index) => items[(normalizedStart + index) % items.length]);
}

export async function mapLimit(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return output;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
