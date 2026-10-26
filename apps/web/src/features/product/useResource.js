import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { productApi } from './api.js';
import {
  emptyResource,
  resourceEntry,
  readResource,
  subscribeResource,
} from '../../lib/http/resource-cache.js';
export function useResource(path, { refreshInterval = 0 } = {}) {
  const entry = resourceEntry(path);
  const subscribe = useCallback((listener) => subscribeResource(entry, listener), [entry]);
  const snapshot = useCallback(() => entry?.snapshot || emptyResource, [entry]);
  const state = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (!entry) return;
    const read = (force = false) =>
      readResource(entry, (signal) => productApi.get(path, signal), force);
    read();
    const timer =
      refreshInterval > 0
        ? setInterval(
            () => {
              if (document.visibilityState === 'visible') read(true);
            },
            Math.max(refreshInterval, 30000),
          )
        : null;
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [entry, path, refreshInterval]);
  return {
    ...state,
    reload: () => readResource(entry, (signal) => productApi.get(path, signal), true),
  };
}
export function useMutation() {
  const [state, setState] = useState({ busy: false, error: null, success: false });
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);
  const run = async (operation) => {
    if (active.current) return null;
    const controller = new AbortController();
    active.current = controller;
    setState({ busy: true, error: null, success: false });
    try {
      const result = await operation(controller.signal);
      if (!controller.signal.aborted) setState({ busy: false, error: null, success: true });
      return controller.signal.aborted ? null : result;
    } catch (error) {
      if (!controller.signal.aborted) setState({ busy: false, error, success: false });
      return null;
    } finally {
      if (active.current === controller) active.current = null;
    }
  };
  return { ...state, run };
}
