import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, parse, uuid } from '../../shared/validation.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { requireVerifiedUser } from '../auth/sessions.mjs';
import { csrfMiddleware } from '../../middleware/security.mjs';
import { resolveAccess, requireWrite, assertBranches } from '../team/access.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { responseView } from '../feedback/service.mjs';
import { findReport } from '../reports/service.mjs';

const uniqueIds = z
  .array(z.uuid())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
const dueDate = z.union([
  z.literal(''),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(value + 'T00:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }),
]);
export const actionInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(5000).default(''),
    branchIds: uniqueIds.refine((ids) => ids.length > 0),
    responseIds: uniqueIds.default([]),
    reportId: z.uuid().nullable().default(null),
    priority: z.enum(['high', 'medium', 'opportunity']).default('medium'),
    status: z.enum(['todo', 'progress', 'done']).default('todo'),
    owner: z.string().trim().max(120).default(''),
    due: dueDate.default(''),
  })
  .strict();
const actionPatch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(5000).optional(),
    branchIds: uniqueIds.refine((ids) => ids.length > 0).optional(),
    responseIds: uniqueIds.optional(),
    reportId: z.uuid().nullable().optional(),
    priority: z.enum(['high', 'medium', 'opportunity']).optional(),
    status: z.enum(['todo', 'progress', 'done']).optional(),
    owner: z.string().trim().max(120).optional(),
    due: dueDate.optional(),
    version: z.number().int().min(1),
  })
  .strict();

export const actionScope = (access) => ({
  workspaceId: access.workspace._id,
  ...(access.branchIds ? { branchIds: { $not: { $elemMatch: { $nin: access.branchIds } } } } : {}),
});
export const actionView = (action) => ({
  id: action._id,
  title: action.title,
  summary: action.summary,
  branchIds: action.branchIds,
  responseIds: action.responseIds,
  reportId: action.reportId,
  priority: action.priority,
  status: action.status,
  owner: action.owner,
  due: action.due,
  version: action.version,
  createdAt: action.createdAt,
  updatedAt: action.updatedAt,
});

async function findAction(id, access, deps, session) {
  const action = await deps.models.Action.findOne({ _id: id, ...actionScope(access) }, null, {
    session,
  }).lean();
  if (!action) throw new ApiError(404, 'NOT_FOUND');
  return action;
}
export async function validateActionEvidence(input, access, deps, session) {
  await assertBranches(access, input.branchIds, deps, { active: false, session });
  if (input.responseIds.length) {
    const count = await deps.models.Response.countDocuments({
      _id: { $in: input.responseIds },
      workspaceId: access.workspace._id,
      branchId: { $in: input.branchIds },
    }).session(session);
    if (count !== input.responseIds.length) throw new ApiError(404, 'NOT_FOUND');
  }
  if (input.reportId) {
    const report = await findReport(input.reportId, access, deps);
    if (report.branchIds.some((id) => !input.branchIds.includes(id)))
      throw new ApiError(422, 'VALIDATION_ERROR');
    const evidenceIds = new Set((report.evidence || []).map((item) => item.id));
    if (input.responseIds.some((id) => !evidenceIds.has(id)))
      throw new ApiError(422, 'VALIDATION_ERROR');
  }
}

export function actionRoutes(deps) {
  const router = Router();
  router.use(async (req, _res, next) => {
    req.user = await requireVerifiedUser(req, deps);
    req.access = await resolveAccess(req.user.id, deps);
    next();
  });
  router.use((req, res, next) =>
    ['GET', 'HEAD'].includes(req.method) ? next() : csrfMiddleware(deps)(req, res, next),
  );
  router.get('/', async (req, res) => {
    const actions = await deps.models.Action.find(actionScope(req.access))
      .sort({ createdAt: -1, _id: -1 })
      .limit(500)
      .lean();
    res.json({ actions: actions.map(actionView) });
  });
  router.post('/', async (req, res) => {
    requireWrite(req.access);
    const input = parse(actionInput, req.body);
    const action = {
      ...input,
      _id: randomUUID(),
      workspaceId: req.access.workspace._id,
      createdBy: req.user.id,
      version: 1,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    };
    await transaction(deps, async (session) => {
      await validateActionEvidence(input, req.access, deps, session);
      await deps.models.Action.insertOne(action, { session });
    });
    res.status(201).json({ action: actionView(action) });
  });
  router.get('/:id', async (req, res) =>
    res.json({ action: actionView(await findAction(uuid(req.params.id), req.access, deps)) }),
  );
  router.patch('/:id', async (req, res) => {
    requireWrite(req.access);
    const input = parse(actionPatch, req.body),
      id = uuid(req.params.id);
    await transaction(deps, async (session) => {
      const previous = await findAction(id, req.access, deps, session);
      const { version, ...patch } = input;
      const next = parse(actionInput, {
        title: previous.title,
        summary: previous.summary,
        branchIds: previous.branchIds,
        responseIds: previous.responseIds,
        reportId: previous.reportId,
        priority: previous.priority,
        status: previous.status,
        owner: previous.owner,
        due: previous.due,
        ...patch,
      });
      await validateActionEvidence(next, req.access, deps, session);
      const result = await deps.models.Action.updateOne(
        { _id: id, ...actionScope(req.access), version },
        { $set: { ...next, updatedAt: deps.now() }, $inc: { version: 1 } },
        { session },
      );
      if (!result.matchedCount) throw new ApiError(409, 'VERSION_CONFLICT');
    });
    res.json({ action: actionView(await findAction(id, req.access, deps)) });
  });
  router.delete('/:id', async (req, res) => {
    requireWrite(req.access);
    const { version } = parse(z.object({ version: z.number().int().min(1) }).strict(), req.body);
    const id = uuid(req.params.id);
    await findAction(id, req.access, deps);
    const result = await deps.models.Action.deleteOne({
      _id: id,
      ...actionScope(req.access),
      version,
    });
    if (!result.deletedCount) throw new ApiError(409, 'VERSION_CONFLICT');
    res.status(204).end();
  });
  router.get('/:id/evidence', async (req, res) => {
    const action = await findAction(uuid(req.params.id), req.access, deps);
    const responses = await deps.models.Response.find({
      _id: { $in: action.responseIds },
      workspaceId: req.access.workspace._id,
      branchId: { $in: action.branchIds },
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    res.json({ action: actionView(action), responses: responses.map(responseView) });
  });
  return router;
}
