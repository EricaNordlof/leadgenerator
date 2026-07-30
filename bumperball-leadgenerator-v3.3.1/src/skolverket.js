function asArray(value) {
  return Array.isArray(value) ? value : null;
}

export function extractSkolverketRows(payload) {
  return (
    asArray(payload) ||
    asArray(payload?.data) ||
    asArray(payload?.data?.attributes) ||
    asArray(payload?.data?.schoolUnits) ||
    asArray(payload?.data?.school_units) ||
    asArray(payload?.data?.items) ||
    asArray(payload?.data?.content) ||
    asArray(payload?.results) ||
    asArray(payload?.items) ||
    asArray(payload?.content) ||
    asArray(payload?._embedded?.schoolUnits) ||
    asArray(payload?._embedded?.school_units) ||
    []
  );
}

export function extractSkolverketDetail(payload) {
  const data = payload?.data;
  const attributes = data?.attributes;

  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return {
      ...attributes,
      id: data?.id ?? attributes.id,
      type: data?.type ?? attributes.type,
      relationships: data?.relationships ?? attributes.relationships,
      included: payload?.included ?? attributes.included
    };
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...data, included: payload?.included ?? data.included };
  }

  if (payload?.attributes && typeof payload.attributes === 'object') {
    return { ...payload.attributes, included: payload?.included };
  }

  return payload && typeof payload === 'object' ? payload : {};
}
