import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveSession } from '../auth/sessions.mjs';
import { ApiError } from '../../middleware/errors.mjs';

const context = new AsyncLocalStorage();
export const workspaceBoundPath = (path, method = 'GET') =>
  (/^\/(?:workspace(?:$|\/|\?)|workspaces\/[^/]+\/branches(?:$|\/|\?)|surveys(?:$|\/|\?)|survey-templates(?:$|\?)|feedback(?:$|\/|\?)|analytics(?:$|\?)|reports(?:$|\/|\?)|ai(?:$|\/|\?)|analysis(?:$|\/|\?)|assistant(?:$|\/|\?)|team(?:$|\/|\?)|business-page(?:$|\?)|billing(?:$|\/|\?)|actions(?:$|\/|\?)|search(?:$|\?))/.test(
    path,
  ) &&
    !/^\/team\/accept(?:$|\?)/.test(path)) ||
  (/^\/account\/notifications(?:$|\?)/.test(path) && ['GET', 'HEAD'].includes(method)) ||
  (/^\/account\/notifications\/read(?:$|\?)/.test(path) && method === 'POST');
export function selectedWorkspaceId(userId) {
  const current = context.getStore();
  return current?.userId === userId ? current.workspaceId || null : null;
}
export function selectRequestWorkspace(userId, workspaceId) {
  const current = context.getStore();
  if (current?.userId === userId) current.workspaceId = workspaceId;
}
export function workspaceRequestContext(deps) {
  return async (req, _res, next) => {
    if (/^\/api\/v1\/(?:health|public)(?:\/|$)/.test(req.path)) return next();
    try {
      const current = await resolveSession(req, deps);
      context.run(
        { userId: current?.user?._id || null, workspaceId: current?.session?.workspaceId || null },
        async () => {
          try {
            const header = req.get('X-Workspace-ID'),
              query = req.query?.expectedWorkspaceId;
            if (header && query && header !== query) throw new ApiError(422, 'VALIDATION_ERROR');
            const expected = header || query;
            if (
              expected &&
              current?.user &&
              workspaceBoundPath(req.path.replace(/^\/api\/v1/, ''), req.method)
            ) {
              if (
                typeof expected !== 'string' ||
                !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(expected)
              )
                throw new ApiError(422, 'VALIDATION_ERROR');
              const { resolveAccess } = await import('../team/access.mjs');
              let access;
              try {
                access = await resolveAccess(current.user._id, deps);
              } catch (error) {
                if (error.status === 404) throw new ApiError(409, 'WORKSPACE_CHANGED');
                throw error;
              }
              if (access.workspace._id !== expected) throw new ApiError(409, 'WORKSPACE_CHANGED');
            }
            next();
          } catch (error) {
            next(error);
          }
        },
      );
    } catch (error) {
      next(error);
    }
  };
}
