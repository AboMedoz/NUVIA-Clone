import { useEffect, useRef, useState } from 'react';
import { productApi } from './api.js';
export function useResource(path, { refreshInterval = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let controller,
      current = true,
      pending = false;
    setState({ data: null, error: null, loading: true });
    const read = () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      productApi
        .get(path, controller.signal)
        .then(
          (data) => {
            if (current) setState({ data, error: null, loading: false });
          },
          (error) => {
            if (current && error.name !== 'AbortError')
              setState((old) => ({ ...old, error, loading: false }));
          },
        )
        .finally(() => {
          pending = false;
        });
    };
    read();
    const timer =
      refreshInterval > 0
        ? setInterval(
            () => {
              if (document.visibilityState === 'visible') read();
            },
            Math.max(refreshInterval, 30000),
          )
        : null;
    return () => {
      current = false;
      controller?.abort();
      if (timer) clearInterval(timer);
    };
  }, [path, revision, refreshInterval]);
  return { ...state, reload: () => setRevision((v) => v + 1) };
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
