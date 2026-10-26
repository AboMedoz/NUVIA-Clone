import { randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { selectedWorkspaceId } from './request-context.mjs';
import { resolveAccess } from '../team/access.mjs';
const normalized = (name) => name.normalize('NFKC').trim().toLowerCase();
const branchView = (branch, primaryId) => ({
  id: branch._id,
  name: branch.name,
  country: branch.country || '',
  city: branch.city || '',
  address: branch.address || '',
  archivedAt: branch.archivedAt?.toISOString() ?? null,
  isPrimary: branch._id === primaryId,
});
async function owned(userId, id, deps, session) {
  const selected = selectedWorkspaceId(userId) || (await resolveAccess(userId, deps)).workspace._id;
  if (id && id !== selected) throw new ApiError(404, 'NOT_FOUND');
  const target = id || selected;
  const workspace = await deps.models.Workspace.findOne(
    { ownerUserId: userId, ...(target ? { _id: target } : {}) },
    null,
    { session },
  ).lean();
  if (!workspace) throw new ApiError(404, 'NOT_FOUND');
  return workspace;
}
export async function getWorkspace(userId, deps, workspaceId) {
  const access = await resolveAccess(userId, deps, workspaceId ? { workspaceId } : {}),
    w = access.workspace;
  const branches = await deps.models.Branch.find({
    workspaceId: w._id,
    archivedAt: null,
    ...(access.branchIds ? { _id: { $in: access.branchIds } } : {}),
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  return {
    id: w._id,
    businessName: w.name,
    industry: w.industry,
    locale: w.locale,
    reportingTimezone: w.reportingTimezone,
    branchType: w.branchMode,
    primaryBranchId:
      !access.branchIds || access.branchIds.includes(w.primaryBranchId) ? w.primaryBranchId : null,
    onboardingStep: w.onboardingStep,
    branches: branches.map((b) => branchView(b, w.primaryBranchId)),
    role: access.role,
    allowedBranchIds: access.branchIds,
  };
}
export async function saveWorkspace(userId, input, deps) {
  const update = {
    name: input.businessName,
    industry: input.industry,
    locale: input.locale,
    reportingTimezone: input.reportingTimezone,
    updatedAt: deps.now(),
  };
  const create = {
    _id: randomUUID(),
    ownerUserId: userId,
    branchMode: 'multiple',
    primaryBranchId: null,
    onboardingStep: 'branches',
    createdAt: deps.now(),
    version: 1,
  };
  let savedId;
  await transaction(deps, async (session) => {
    // Serialize first-workspace onboarding after the former unique-owner index is migrated.
    await deps.models.User.updateOne(
      { _id: userId },
      { $set: { updatedAt: deps.now() }, $inc: { workspaceVersion: 1 } },
      { session },
    );
    const selected = selectedWorkspaceId(userId);
    const existing = await deps.models.Workspace.findOne(
      { ownerUserId: userId, ...(selected ? { _id: selected } : {}) },
      null,
      { session },
    )
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    if (selected && !existing) throw new ApiError(403, 'FORBIDDEN');
    if (!existing) {
      const membership = await deps.models.Membership.findOne({ userId, revokedAt: null }, null, {
        session,
      }).lean();
      if (membership) throw new ApiError(403, 'FORBIDDEN');
      await deps.models.Workspace.insertOne({ ...create, ...update }, { session });
      savedId = create._id;
    } else {
      await deps.models.Workspace.updateOne(
        { _id: existing._id, ownerUserId: userId },
        { $set: update },
        { session },
      );
      savedId = existing._id;
    }
  });
  return getWorkspace(userId, deps, savedId);
}
async function mutateWorkspace(userId, workspaceId, deps, action) {
  try {
    return await transaction(deps, async (session) => {
      const workspace = await owned(userId, workspaceId, deps, session);
      await deps.models.Workspace.updateOne(
        { _id: workspace._id, ownerUserId: userId },
        { $inc: { version: 1 }, $set: { updatedAt: deps.now() } },
        { session },
      );
      return action(workspace, session);
    });
  } catch (e) {
    if (e.code === 11000) throw new ApiError(409, 'BRANCH_NAME_USED');
    throw e;
  }
}
export async function completeSetup(userId, input, deps) {
  await mutateWorkspace(userId, null, deps, async (w, session) => {
    const branches = deps.models.Branch;
    if (
      input.branchType === 'single' &&
      (await branches.countDocuments(
        { workspaceId: w._id, archivedAt: null, _id: { $ne: w.primaryBranchId } },
        { session },
      ))
    )
      throw new ApiError(409, 'ACTIVE_BRANCHES_EXIST');
    const id = w.primaryBranchId || randomUUID(),
      branchName = input.branchType === 'multiple' ? input.branchName : w.name;
    if (!branchName?.trim()) throw new ApiError(422, 'BRANCH_NAME_REQUIRED');
    await branches.updateOne(
      { _id: id, workspaceId: w._id },
      {
        $set: {
          name: branchName,
          normalizedName: normalized(branchName),
          updatedAt: deps.now(),
          archivedAt: null,
        },
        $setOnInsert: { createdAt: deps.now() },
      },
      { upsert: true, session },
    );
    await deps.models.Workspace.updateOne(
      { _id: w._id, ownerUserId: userId },
      { $set: { branchMode: input.branchType, primaryBranchId: id, onboardingStep: 'complete' } },
      { session },
    );
  });
  return getWorkspace(userId, deps);
}
export async function listBranches(userId, workspaceId, { includeArchived = false }, deps) {
  const access = await resolveAccess(userId, deps),
    w = access.workspace;
  if (w._id !== workspaceId) throw new ApiError(404, 'NOT_FOUND');
  const items = await deps.models.Branch.find({
    workspaceId,
    ...(access.branchIds ? { _id: { $in: access.branchIds } } : {}),
    ...(includeArchived ? {} : { archivedAt: null }),
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  return Promise.all(
    items.map(async (b) => ({
      ...branchView(b, w.primaryBranchId),
      responses: await deps.models.Response.countDocuments({ workspaceId, branchId: b._id }),
    })),
  );
}
export async function createBranch(
  userId,
  workspaceId,
  { name, country = '', city = '', address = '' },
  deps,
) {
  return mutateWorkspace(userId, workspaceId, deps, async (w, session) => {
    if (w.onboardingStep !== 'complete' || w.branchMode !== 'multiple')
      throw new ApiError(409, 'MULTIPLE_BRANCHES_REQUIRED');
    const branch = {
      _id: randomUUID(),
      workspaceId,
      name,
      country,
      city,
      address,
      normalizedName: normalized(name),
      archivedAt: null,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    };
    await deps.models.Branch.insertOne(branch, { session });
    return branchView(branch, w.primaryBranchId);
  });
}
export async function updateBranch(userId, workspaceId, branchId, input, deps) {
  return mutateWorkspace(userId, workspaceId, deps, async (w, session) => {
    const branches = deps.models.Branch;
    const branch = await branches.findOne({ _id: branchId, workspaceId }, null, { session }).lean();
    if (!branch) throw new ApiError(404, 'NOT_FOUND');
    if (input.archived && branchId === w.primaryBranchId)
      throw new ApiError(409, 'PRIMARY_BRANCH_REQUIRED');
    if (input.isPrimary && (input.archived || (branch.archivedAt && input.archived !== false)))
      throw new ApiError(409, 'ACTIVE_BRANCH_REQUIRED');
    if (input.archived === false && branch.archivedAt && w.branchMode === 'single')
      throw new ApiError(409, 'MULTIPLE_BRANCHES_REQUIRED');
    const update = { updatedAt: deps.now() };
    if (input.name !== undefined)
      Object.assign(update, { name: input.name, normalizedName: normalized(input.name) });
    for (const key of ['country', 'city', 'address'])
      if (input[key] !== undefined) update[key] = input[key];
    if (input.archived !== undefined) update.archivedAt = input.archived ? deps.now() : null;
    await branches.updateOne({ _id: branchId, workspaceId }, { $set: update }, { session });
    if (input.archived)
      await deps.models.SurveyLink.updateMany(
        { workspaceId, branchId, enabled: true },
        { $set: { enabled: false }, $inc: { version: 1 } },
        { session },
      );
    if (input.isPrimary)
      await deps.models.Workspace.updateOne(
        { _id: workspaceId, ownerUserId: userId },
        { $set: { primaryBranchId: branchId } },
        { session },
      );
    return branchView({ ...branch, ...update }, input.isPrimary ? branchId : w.primaryBranchId);
  });
}
