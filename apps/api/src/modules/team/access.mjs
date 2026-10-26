import { ApiError } from '../../middleware/errors.mjs';
import { selectedWorkspaceId } from '../workspaces/request-context.mjs';

// Resolve membership on every request so revocations and branch changes apply immediately.
export async function resolveAccess(
  userId,
  deps,
  { workspaceId = selectedWorkspaceId(userId) } = {},
) {
  let workspace = await deps.models.Workspace.findOne({
    ownerUserId: userId,
    ...(workspaceId ? { _id: workspaceId } : {}),
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  if (workspace) return { workspace, role: 'owner', branchIds: null };
  const membership = await deps.models.Membership.findOne({
    userId,
    revokedAt: null,
    ...(workspaceId ? { workspaceId } : {}),
  })
    .sort({ createdAt: 1 })
    .lean();
  if (!membership) throw new ApiError(404, 'NOT_FOUND');
  workspace = await deps.models.Workspace.findOne({ _id: membership.workspaceId }).lean();
  if (!workspace) throw new ApiError(404, 'NOT_FOUND');
  return { workspace, role: membership.role, branchIds: membership.branchIds, membership };
}
export function requireWrite(access, ownerOnly = false) {
  if (access.role === 'viewer' || (ownerOnly && access.role !== 'owner'))
    throw new ApiError(403, 'FORBIDDEN');
}
export function branchAllowed(access, branchId) {
  if (access.branchIds && !access.branchIds.includes(branchId))
    throw new ApiError(404, 'NOT_FOUND');
}
export async function assertBranches(access, ids, deps, { active = true, session } = {}) {
  for (const id of ids) branchAllowed(access, id);
  const branches = await deps.models.Branch.find(
    {
      _id: { $in: ids },
      workspaceId: access.workspace._id,
      ...(active ? { archivedAt: null } : {}),
    },
    null,
    { session },
  ).lean();
  if (branches.length !== new Set(ids).size) throw new ApiError(404, 'NOT_FOUND');
  return branches;
}
export const scopedBranches = (access) =>
  access.branchIds ? { branchId: { $in: access.branchIds } } : {};
export const scopedJobs = (access) =>
  access.branchIds
    ? {
        $or: [
          { branchId: { $in: access.branchIds } },
          { branchIds: { $exists: true, $not: { $elemMatch: { $nin: access.branchIds } } } },
        ],
      }
    : {};
