export function normalizeDraftContent(template, overrides = {}) {
  const customSubject = String(overrides.subject ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const customBody = String(overrides.body ?? '')
    .replace(/\r\n/g, '\n')
    .trim();

  return {
    subject: customSubject || template.subject,
    body: customBody || template.body
  };
}
