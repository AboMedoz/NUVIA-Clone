import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, resetApiSession, setApiWorkspace } from '../src/lib/http/client.js';
afterEach(() => {
  resetApiSession();
  vi.unstubAllGlobals();
});
describe('API transport', () => {
  it('blocks a stale workspace write and refreshes the session without replaying it', async () => {
    const expired = vi.fn();
    window.addEventListener('nuvia:session-expired', expired);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'csrf', workspace: { id: 'workspace-a' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'WORKSPACE_CHANGED' } }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'csrf-new', workspace: { id: 'workspace-b' } })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalResponses: 2 })));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/auth/session');
    await expect(
      apiRequest('/workspace', {
        method: 'PUT',
        body: { businessName: 'Old tab name', industry: 'Cafe' },
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_CHANGED' });
    expect(fetch.mock.calls[1][1].headers['X-Workspace-ID']).toBe('workspace-a');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledTimes(1);
    await apiRequest('/auth/session');
    await apiRequest('/analytics');
    expect(fetch.mock.calls[3][1].headers['X-Workspace-ID']).toBe('workspace-b');
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
    window.removeEventListener('nuvia:session-expired', expired);
  });
  it('does not impose the previous workspace on switching or user-specific requests', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ status: 'accepted' }))),
      );
    vi.stubGlobal('fetch', fetch);
    setApiWorkspace('workspace-a');
    await apiRequest('/account/profile');
    await apiRequest('/workspaces');
    expect(fetch.mock.calls.every(([, options]) => !options.headers['X-Workspace-ID'])).toBe(true);
  });
  it('re-bootstraps stale CSRF on the next explicit attempt without replaying a mutation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null, csrfToken: 'old-csrf' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'CSRF_REJECTED' } }), { status: 403 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null, csrfToken: 'new-csrf' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'accepted' })));
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'CSRF_REJECTED',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await apiRequest('/auth/login', { method: 'POST', body: {} });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[3][1].headers['X-CSRF-Token']).toBe('new-csrf');
  });
  it('shares CSRF bootstrap and sends cookies, origin-bound requests and no local storage secrets', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null, csrfToken: 'csrf' })))
      .mockResolvedValue(new Response(JSON.stringify({ status: 'accepted' })));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: { email: 'a@example.test' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/forgot-password');
    expect(fetch.mock.calls[1][1].credentials).toBe('include');
    expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf');
    expect(localStorage.length).toBe(0);
  });
  it('surfaces safe errors without reflecting raw server messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'private detail' } }),
            { status: 503 },
          ),
        ),
    );
    await expect(apiRequest('/auth/session')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
  });
});
