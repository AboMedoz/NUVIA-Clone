// Private GET results live only in memory, for the current HTTP session/workspace.
const entries = new Map();
let scope = 0;
const ttl = 30000;
const empty = { data: null, error: null, loading: false };
function publish(entry, snapshot) {
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}
export function resourceEntry(path) {
  if (!path) return null;
  const key = scope + ':' + path;
  if (!entries.has(key)) {
    // Active readers are never evicted. Limit retained navigation/filter results.
    for (const [oldKey, old] of entries) {
      if (entries.size < 100) break;
      if (!old.listeners.size) {
        old.controller?.abort();
        entries.delete(oldKey);
      }
    }
    entries.set(key, {
      snapshot: { ...empty, loading: true },
      listeners: new Set(),
      updated: 0,
      version: 0,
      scope,
    });
  }
  return entries.get(key);
}
export const emptyResource = empty;
export function readResource(entry, load, force = false) {
  if (!entry || entry.scope !== scope || entry.promise) return;
  entry.load = load;
  if (!force && Date.now() - entry.updated < ttl) return;
  const controller = new AbortController();
  const version = ++entry.version;
  entry.controller = controller;
  publish(entry, { ...entry.snapshot, error: null, loading: entry.snapshot.data === null });
  entry.promise = Promise.resolve()
    .then(() => (controller.signal.aborted ? undefined : load(controller.signal)))
    .then(
      (data) => {
        if (entry.scope === scope && version === entry.version && !controller.signal.aborted) {
          entry.updated = Date.now();
          publish(entry, { data, error: null, loading: false });
        }
      },
      (error) => {
        if (entry.scope === scope && version === entry.version && !controller.signal.aborted)
          publish(entry, {
            ...entry.snapshot,
            data: [401, 403, 404].includes(error.status) ? null : entry.snapshot.data,
            error,
            loading: false,
          });
      },
    )
    .finally(() => {
      if (entry.version === version) entry.promise = null;
    });
}
export function subscribeResource(entry, listener) {
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    // Allow React's immediate resubscription before cancelling the final reader.
    queueMicrotask(() => {
      if (!entry.listeners.size && entry.promise) {
        entry.version++;
        entry.controller?.abort();
        entry.promise = null;
      }
    });
  };
}
export function invalidateResources() {
  for (const entry of entries.values()) {
    entry.updated = 0;
    entry.version++;
    entry.controller?.abort();
    entry.promise = null;
    if (entry.listeners.size && entry.load) readResource(entry, entry.load, true);
  }
}
export function clearResources() {
  scope++;
  for (const entry of entries.values()) {
    entry.controller?.abort();
    publish(entry, { ...empty, loading: true });
  }
  entries.clear();
}
