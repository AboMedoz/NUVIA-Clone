export function validateAnswers(questions, values) {
  const errors = {};
  for (const q of questions) {
    const value = values[q.id];
    const missing =
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      value === null ||
      (Array.isArray(value) && !value.length);
    if (missing) {
      if (q.required) errors[q.id] = 'required';
      continue;
    }
    if (
      ['nps', 'rating'].includes(q.type) &&
      (!Number.isInteger(Number(value)) ||
        Number(value) < (q.type === 'nps' ? 0 : 1) ||
        Number(value) > (q.type === 'nps' ? 10 : 5))
    )
      errors[q.id] = 'invalid';
    if (q.type === 'single_choice' && !q.options?.includes(value)) errors[q.id] = 'invalid';
    if (
      q.type === 'multiple_choice' &&
      (!Array.isArray(value) || value.some((v) => !q.options?.includes(v)))
    )
      errors[q.id] = 'invalid';
  }
  return errors;
}
function dateBoundary(value, end, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const wallTime = Date.parse(value + (end ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  let utc = wallTime;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(utc));
    const offset = parts
      .find((p) => p.type === 'timeZoneName')
      .value.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = offset
      ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1)
      : 0;
    const next = wallTime - minutes * 60000;
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc).toISOString();
}
export function requestFilters(filters = {}, timezone = 'UTC') {
  const { segmentKey, segmentValue, ...rest } = filters;
  const result = Object.fromEntries(
    Object.entries(rest).filter(
      ([, v]) => v !== '' && v !== undefined && v !== null && v !== 'all',
    ),
  );
  if (result.from) result.from = dateBoundary(result.from, false, timezone);
  if (result.to) result.to = dateBoundary(result.to, true, timezone);
  if (segmentKey && segmentValue !== '')
    result.segment = JSON.stringify({ [segmentKey]: segmentValue });
  return result;
}
export function queryString(filters = {}, timezone = 'UTC') {
  const value = new URLSearchParams(
    Object.entries(requestFilters(filters, timezone)).filter(
      ([, v]) => v !== '' && v !== undefined && v !== null && v !== 'all',
    ),
  ).toString();
  return value ? '?' + value : '';
}
export const canManage = (workspace) => ['owner', 'manager'].includes(workspace?.role || 'owner');
export const isOwner = (workspace) => (workspace?.role || 'owner') === 'owner';
export const questionTypes = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'rating',
  'nps',
];
export const publicLink = (token) =>
  `${location.origin}${location.pathname}#/s/${encodeURIComponent(token)}`;
