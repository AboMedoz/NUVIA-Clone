const key = 'nuvia-product-return-v1';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function safeProductReturn(value) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  const [route, query] = value.split('?');
  if (
    !/^#\/(?:dashboard|overview|feedbacks|feedback-details|reports|report-details|analytics(?:-(?:sentiment|aspects|topics|trends|comparison))?|notifications|action-board|evidence|surveys|survey-(?:all|create|edit|share|results)|business|branches|settings|nuvia-assistant|assistant)$/.test(
      route,
    )
  )
    return null;
  const params = new URLSearchParams(query),
    safe = new URLSearchParams();
  for (const field of ['id', 'workspace']) {
    const value = params.get(field);
    if (value && uuid.test(value)) safe.set(field, value);
  }
  return route + (safe.size ? '?' + safe : '');
}
export function saveProductReturn(value) {
  const safe = safeProductReturn(value);
  if (safe) {
    try {
      sessionStorage.setItem(key, safe);
    } catch {
      /* Navigation still works in memory when storage is unavailable. */
    }
  }
  return safe;
}
export function readProductReturn() {
  try {
    return safeProductReturn(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}
export function takeProductReturn() {
  const value = readProductReturn();
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* No persistent token or credential is used. */
  }
  return value;
}
