import { API_PREFIX } from '@nuvia/shared-types';
let csrfToken = null,
  apiWorkspaceId = null,
  pendingBootstrap = null,
  epoch = 0;
export function resetApiSession() {
  epoch++;
  csrfToken = null;
  apiWorkspaceId = null;
  pendingBootstrap = null;
}
export function setApiWorkspace(id) {
  apiWorkspaceId = id || null;
}
const workspaceBoundPath = (path, method = 'GET') =>
  (/^\/(?:workspace(?:$|\/|\?)|workspaces\/[^/]+\/branches(?:$|\/|\?)|surveys(?:$|\/|\?)|survey-templates(?:$|\?)|feedback(?:$|\/|\?)|analytics(?:$|\?)|reports(?:$|\/|\?)|ai(?:$|\/|\?)|analysis(?:$|\/|\?)|assistant(?:$|\/|\?)|team(?:$|\/|\?)|business-page(?:$|\?)|billing(?:$|\/|\?)|actions(?:$|\/|\?)|search(?:$|\?))/.test(
    path,
  ) &&
    !/^\/team\/accept(?:$|\?)/.test(path)) ||
  (/^\/account\/notifications(?:$|\?)/.test(path) && ['GET', 'HEAD'].includes(method)) ||
  (/^\/account\/notifications\/read(?:$|\?)/.test(path) && method === 'POST');
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR', status: 0 });
  }
  const data = response.status === 204 ? undefined : await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data?.error?.code || 'REQUEST_FAILED'), {
      code: data?.error?.code || 'REQUEST_FAILED',
      status: response.status,
      details: data?.error?.details || [],
    });
  return data;
}
export function bootstrapSession() {
  if (pendingBootstrap) return pendingBootstrap;
  const version = epoch;
  const promise = request('/auth/session')
    .then((data) => {
      if (version === epoch) {
        csrfToken = data.csrfToken;
        setApiWorkspace(data.workspace?.id);
      }
      return data;
    })
    .finally(() => {
      if (pendingBootstrap === promise) pendingBootstrap = null;
    });
  pendingBootstrap = promise;
  return promise;
}
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  if (path === '/auth/session' && method === 'GET') return bootstrapSession();
  const expectedWorkspace = apiWorkspaceId;
  if (method !== 'GET' && !csrfToken) await bootstrapSession();
  const version = epoch;
  let data;
  try {
    data = await request(path, {
      method,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: {
        ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
        ...(workspaceBoundPath(path, method) && (expectedWorkspace || apiWorkspaceId)
          ? { 'X-Workspace-ID': expectedWorkspace || apiWorkspaceId }
          : {}),
      },
    });
  } catch (error) {
    if (
      version === epoch &&
      ['AUTH_REQUIRED', 'CSRF_REJECTED', 'WORKSPACE_CHANGED'].includes(error.code)
    ) {
      resetApiSession();
      window.dispatchEvent(new Event('nuvia:session-expired'));
    }
    throw error;
  }
  if (version === epoch && data?.csrfToken) csrfToken = data.csrfToken;
  if (method !== 'GET' && path === '/auth/logout') resetApiSession();
  return data;
}
