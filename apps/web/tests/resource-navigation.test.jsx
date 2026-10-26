import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useResource } from '../src/features/product/useResource.js';
import { productApi } from '../src/features/product/api.js';
import { apiRequest, resetApiSession, setApiWorkspace } from '../src/lib/http/client.js';

beforeEach(() => resetApiSession());
afterEach(() => vi.useRealTimers());
it.each(['/workspaces/new/select', '/workspaces', '/team/accept'])(
  'waits for refreshed session scope before reloading resources after %s',
  async (mutationPath) => {
    let selected = 'old';
    const reads = [],
      expired = vi.fn();
    window.addEventListener('nuvia:session-expired', expired);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const path = String(url).replace('/api/v1', '');
      let data,
        status = 200;
      if (path === '/auth/session') data = { csrfToken: 'test-csrf', workspace: { id: selected } };
      else if (path === mutationPath) {
        selected = 'new';
        data = { workspace: { id: selected } };
      } else {
        reads.push(options.headers['X-Workspace-ID']);
        if (options.headers['X-Workspace-ID'] && options.headers['X-Workspace-ID'] !== selected) {
          status = 409;
          data = { error: { code: 'WORKSPACE_CHANGED' } };
        } else data = { workspace: selected };
      }
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    try {
      await apiRequest('/auth/session');
      const view = renderHook(() => useResource('/analytics'));
      await waitFor(() => expect(view.result.current.data).toEqual({ workspace: 'old' }));
      await act(async () => apiRequest(mutationPath, { method: 'POST', body: {} }));
      expect(reads).toEqual(['old']);
      expect(expired).not.toHaveBeenCalled();
      await act(async () => apiRequest('/auth/session'));
      await waitFor(() => expect(view.result.current.data).toEqual({ workspace: 'new' }));
      expect(reads).toEqual(['old', 'new']);
      expect(expired).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('nuvia:session-expired', expired);
    }
  },
);
it('polls at the first interval even when the previous response completed later than its start', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const get = vi
    .spyOn(productApi, 'get')
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ unreadCount: 1 }), 100)),
    );
  const view = renderHook(() => useResource('/account/notifications', { refreshInterval: 30000 }));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(view.result.current.data).toEqual({ unreadCount: 1 });
  await act(async () => vi.advanceTimersByTimeAsync(29900));
  expect(get).toHaveBeenCalledTimes(2);
  expect(view.result.current.loading).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(100));
  view.unmount();
});
it('reuses data on navigation and deduplicates simultaneous readers', async () => {
  const get = vi.spyOn(productApi, 'get').mockResolvedValue({ total: 7 });
  const first = renderHook(() => useResource('/analytics'));
  const second = renderHook(() => useResource('/analytics'));
  await waitFor(() => expect(first.result.current.data?.total).toBe(7));
  expect(get).toHaveBeenCalledTimes(1);
  first.unmount();
  second.unmount();
  const next = renderHook(() => useResource('/analytics'));
  expect(next.result.current.data).toEqual({ total: 7 });
  expect(next.result.current.loading).toBe(false);
  expect(get).toHaveBeenCalledTimes(1);
});
it('isolates filters and workspace switches immediately', async () => {
  vi.spyOn(productApi, 'get').mockImplementation(async (path) => ({ path }));
  setApiWorkspace('one');
  const view = renderHook(({ path }) => useResource(path), {
    initialProps: { path: '/analytics?branchId=one' },
  });
  await waitFor(() =>
    expect(view.result.current.data).toEqual({ path: '/analytics?branchId=one' }),
  );
  view.rerender({ path: '/analytics?branchId=two' });
  expect(view.result.current.data).toBeNull();
  await waitFor(() => expect(view.result.current.data?.path).toContain('two'));
  act(() => setApiWorkspace('two'));
  view.rerender({ path: '/analytics?branchId=two' });
  expect(view.result.current.data).toBeNull();
});
it('keeps loaded content while explicitly refreshing', async () => {
  let finish;
  vi.spyOn(productApi, 'get')
    .mockResolvedValueOnce({ total: 1 })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const view = renderHook(() => useResource('/surveys'));
  await waitFor(() => expect(view.result.current.data?.total).toBe(1));
  act(() => view.result.current.reload());
  expect(view.result.current.data).toEqual({ total: 1 });
  expect(view.result.current.loading).toBe(false);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => finish({ total: 2 }));
  expect(view.result.current.data).toEqual({ total: 2 });
});
it('invalidates an active pending GET after a successful write and ignores its late result', async () => {
  const completions = [];
  vi.spyOn(productApi, 'get').mockImplementation(
    (path, signal) => new Promise((resolve) => completions.push({ resolve, signal })),
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/auth/session')
            ? { csrfToken: 'test-csrf' }
            : { survey: { id: 'saved' } },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const view = renderHook(() => useResource('/surveys'));
  await waitFor(() => expect(completions).toHaveLength(1));
  await act(async () => {
    await productApi.send('/surveys', { title: 'Saved' });
  });
  await waitFor(() => expect(completions).toHaveLength(2));
  expect(completions[0].signal.aborted).toBe(true);
  await act(async () => completions[1].resolve({ surveys: ['saved'] }));
  await act(async () => completions[0].resolve({ surveys: ['obsolete'] }));
  expect(view.result.current.data).toEqual({ surveys: ['saved'] });
});
it('discards late results after session reset or access changes', async () => {
  const completions = [];
  vi.spyOn(productApi, 'get').mockImplementation(
    (path, signal) => new Promise((resolve) => completions.push({ resolve, signal })),
  );
  setApiWorkspace('one', 'owner');
  const view = renderHook(() => useResource('/feedback'));
  await waitFor(() => expect(completions).toHaveLength(1));
  act(() => setApiWorkspace('one', 'viewer'));
  await waitFor(() => expect(completions).toHaveLength(2));
  expect(completions[0].signal.aborted).toBe(true);
  await act(async () => completions[0].resolve({ responses: ['private'] }));
  expect(view.result.current.data).toBeNull();
  await act(async () => completions[1].resolve({ responses: ['assigned'] }));
  expect(view.result.current.data).toEqual({ responses: ['assigned'] });
  act(() => resetApiSession());
  await waitFor(() => expect(completions).toHaveLength(3));
  expect(view.result.current.data).toBeNull();
  await act(async () => completions[2].resolve({ responses: [] }));
  expect(view.result.current.data).toEqual({ responses: [] });
});
