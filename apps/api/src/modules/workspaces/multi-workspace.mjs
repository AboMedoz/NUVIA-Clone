import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z, parse, name, locale, uuid } from '../../shared/validation.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { csrfMiddleware } from '../../middleware/security.mjs';
import { requireVerifiedUser, resolveSession } from '../auth/sessions.mjs';
import { resolveAccess } from '../team/access.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { selectedWorkspaceId, selectRequestWorkspace } from './request-context.mjs';
import { getWorkspace } from './service.mjs';

const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
const inputSchema = z
  .object({
    businessName: name,
    industry: name,
    locale: locale.default('en'),
    reportingTimezone: timezone.default('Africa/Cairo'),
    branchType: z.enum(['single', 'multiple']).default('multiple'),
    branchName: name.optional(),
  })
  .strict();

export async function listWorkspaces(userId, deps) {
  const memberships = await deps.models.Membership.find({ userId, revokedAt: null }).lean();
  const membershipById = new Map(memberships.map((item) => [item.workspaceId, item]));
  const workspaces = await deps.models.Workspace.find({
    $or: [{ ownerUserId: userId }, { _id: { $in: [...membershipById.keys()] } }],
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const selected = selectedWorkspaceId(userId);
  let fallback = null;
  if (!selected && workspaces.length) {
    try {
      fallback = (await resolveAccess(userId, deps)).workspace._id;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return workspaces.map((workspace) => ({
    id: workspace._id,
    businessName: workspace.name,
    industry: workspace.industry,
    onboardingStep: workspace.onboardingStep,
    role: workspace.ownerUserId === userId ? 'owner' : membershipById.get(workspace._id).role,
    selected: workspace._id === (selected || fallback),
  }));
}

export async function selectWorkspace(userId, workspaceId, sessionId, deps) {
  await resolveAccess(userId, deps, { workspaceId });
  const result = await deps.models.Session.updateOne(
    { _id: sessionId, userId, revokedAt: null, expiresAt: { $gt: deps.now() } },
    { $set: { workspaceId } },
  );
  if (!result.matchedCount) throw new ApiError(401, 'AUTH_REQUIRED');
  selectRequestWorkspace(userId, workspaceId);
  return getWorkspace(userId, deps, workspaceId);
}

export async function createBusiness(userId, input, sessionId, deps) {
  const id = randomUUID(),
    branchId = randomUUID(),
    now = deps.now();
  const workspace = {
    _id: id,
    ownerUserId: userId,
    name: input.businessName,
    industry: input.industry,
    locale: input.locale,
    reportingTimezone: input.reportingTimezone,
    branchMode: input.branchType,
    primaryBranchId: branchId,
    onboardingStep: 'complete',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const branchName = input.branchName || input.businessName;
  try {
    await transaction(deps, async (session) => {
      // Account-level serialization keeps workspace creation and session selection coherent.
      await deps.models.User.updateOne(
        { _id: userId },
        { $set: { updatedAt: now }, $inc: { workspaceVersion: 1 } },
        { session },
      );
      await deps.models.Workspace.insertOne(workspace, { session });
      await deps.models.Branch.insertOne(
        {
          _id: branchId,
          workspaceId: id,
          name: branchName,
          normalizedName: branchName.normalize('NFKC').trim().toLowerCase(),
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );
      const result = await deps.models.Session.updateOne(
        { _id: sessionId, userId, revokedAt: null, expiresAt: { $gt: deps.now() } },
        { $set: { workspaceId: id } },
        { session },
      );
      if (!result.matchedCount) throw new ApiError(401, 'AUTH_REQUIRED');
    });
  } catch (error) {
    if (
      error.code === 11000 &&
      (error.keyPattern?.ownerUserId || /ownerUserId_1/.test(error.message))
    )
      throw new ApiError(409, 'WORKSPACE_MIGRATION_REQUIRED');
    throw error;
  }
  selectRequestWorkspace(userId, id);
  return getWorkspace(userId, deps, id);
}

export function multiWorkspaceRoutes(deps) {
  const router = Router();
  router.use(async (req, _res, next) => {
    req.user = await requireVerifiedUser(req, deps);
    req.current = await resolveSession(req, deps);
    next();
  });
  router.use((req, res, next) =>
    ['GET', 'HEAD'].includes(req.method) ? next() : csrfMiddleware(deps)(req, res, next),
  );
  router.get('/', async (req, res) =>
    res.json({ workspaces: await listWorkspaces(req.user.id, deps) }),
  );
  router.post('/', async (req, res) =>
    res.status(201).json({
      workspace: await createBusiness(
        req.user.id,
        parse(inputSchema, req.body),
        req.current.session._id,
        deps,
      ),
    }),
  );
  router.post('/:id/select', async (req, res) => {
    parse(z.object({}).strict(), req.body);
    res.json({
      workspace: await selectWorkspace(
        req.user.id,
        uuid(req.params.id),
        req.current.session._id,
        deps,
      ),
    });
  });
  return router;
}
