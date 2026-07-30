export function extractSkolverketRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.schoolUnits)) return payload.data.schoolUnits;
  if (Array.isArray(payload?.data?.school_units)) return payload.data.school_units;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?._embedded?.schoolUnits)) return payload._embedded.schoolUnits;
  if (Array.isArray(payload?._embedded?.school_units)) return payload._embedded.school_units;
  return [];
}
