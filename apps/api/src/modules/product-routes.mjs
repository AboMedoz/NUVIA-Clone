import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, parse, uuid, locale, email, token } from '../shared/validation.mjs';
import { requireVerifiedUser, resolveSession } from './auth/sessions.mjs';
import { csrfMiddleware } from '../middleware/security.mjs';
import { createLimiter } from '../middleware/rate-limits.mjs';
import { resolveAccess, requireWrite, scopedJobs } from './team/access.mjs';
import { surveyInput, surveyPatch, publicInput } from './surveys/validation.mjs';
import {
  createSurvey,
  listSurveys,
  findSurvey,
  surveyView,
  editSurvey,
  publishSurvey,
  closeSurvey,
  publicSurvey,
  safePublicSurvey,
  submitResponse,
  surveyTemplates,
} from './surveys/service.mjs';
import {
  filterSchema,
  filterQuery,
  listFeedback,
  findResponse,
  responseView,
  csvRow,
} from './feedback/service.mjs';
import { analytics } from './analytics/service.mjs';
import { capabilities, executeTask } from '../integrations/ai-service/client.mjs';
import { retryJobs, jobView } from './analysis/service.mjs';
import { listTeam, invite, acceptInvitation, updateMember, revoke } from './team/service.mjs';
import {
  createReport,
  findReport,
  reportView,
  reportAllowed,
  assistant,
} from './reports/service.mjs';
import { exportReport } from './reports/pdf.mjs';
import { pageView, savePage, publicPage } from './business-page/service.mjs';

const branchIds = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length);
const role = z.enum(['manager', 'viewer']);
const safeUrl = z.union([
  z.literal(''),
  z
    .url()
    .max(2000)
    .refine((v) => new URL(v).protocol === 'https:'),
]);
export function productRoutes(deps) {
  const router = Router(),
    limit = createLimiter(deps);
  router.use('/public', (req, res, next) => {
    limit(`public:${req.ip}`, req.method === 'GET' ? 300 : 60, 900000, res);
    next();
  });
  router.get('/public/surveys/:token', async (req, res) => {
    res.json(safePublicSurvey(await publicSurvey(parse(token, req.params.token), deps)));
  });
  router.post('/public/surveys/:token/responses', async (req, res) => {
    const response = await submitResponse(
      parse(token, req.params.token),
      parse(publicInput, req.body),
      deps,
    );
    res.status(201).json({ response });
  });
  router.get('/public/business/:slug', async (req, res) =>
    res.json(await publicPage(parse(z.string().regex(/^[a-z0-9-]{3,80}$/), req.params.slug), deps)),
  );

  router.use(
    [
      '/surveys',
      '/survey-templates',
      '/feedback',
      '/analytics',
      '/reports',
      '/ai',
      '/analysis',
      '/assistant',
      '/team',
      '/business-page',
    ],
    async (req, res, next) => {
      req.user = await requireVerifiedUser(req, deps);
      if (!['GET', 'HEAD'].includes(req.method))
        await new Promise((resolve, reject) =>
          csrfMiddleware(deps)(req, res, (error) => (error ? reject(error) : resolve())),
        );
      limit(`product:${req.user.id}`, 300, 900000, res);
      if (req.originalUrl.split('?')[0] !== '/api/v1/team/accept')
        req.access = await resolveAccess(req.user.id, deps);
      next();
    },
  );
  router.get('/survey-templates', (_req, res) => res.json({ templates: surveyTemplates }));
  router.get('/surveys', async (req, res) =>
    res.json({ surveys: await listSurveys(req.access, deps) }),
  );
  router.post('/surveys', async (req, res) =>
    res
      .status(201)
      .json({ survey: await createSurvey(parse(surveyInput, req.body), req.access, deps) }),
  );
  router.post('/surveys/suggest', async (req, res) => {
    requireWrite(req.access);
    const input = parse(
      z
        .object({
          businessType: z.string().min(1).max(200),
          goal: z.string().min(1).max(1000),
          locale,
        })
        .strict(),
      req.body,
    );
    const result = await executeTask(
      'survey_generation',
      {
        taskId: randomUUID(),
        locale: input.locale,
        text: `${input.businessType}\n${input.goal}`,
        parameters: { businessType: input.businessType, goal: input.goal },
      },
      deps,
    );
    res.json(
      result.status === 'succeeded'
        ? { status: 'succeeded', suggestions: result.result, requiresReview: true }
        : {
            status: result.status === 'unavailable' ? 'model_unavailable' : 'failed',
            suggestions: null,
            capability: 'survey_generation',
            error: result.error,
          },
    );
  });
  router.get('/surveys/:id', async (req, res) =>
    res.json({
      survey: await surveyView(
        await findSurvey(uuid(req.params.id), req.access, deps),
        req.access,
        deps,
      ),
    }),
  );
  router.patch('/surveys/:id', async (req, res) =>
    res.json({
      survey: await editSurvey(uuid(req.params.id), parse(surveyPatch, req.body), req.access, deps),
    }),
  );
  router.post('/surveys/:id/publish', async (req, res) => {
    const input = parse(z.object({ branchIds }).strict(), req.body);
    res.json({
      survey: await publishSurvey(uuid(req.params.id), input.branchIds, req.access, deps),
    });
  });
  router.post('/surveys/:id/close', async (req, res) => {
    parse(z.object({}).strict(), req.body);
    res.json({ survey: await closeSurvey(uuid(req.params.id), req.access, deps) });
  });
  router.get('/feedback', async (req, res) =>
    res.json(await listFeedback(parse(filterSchema, req.query), req.access, deps)),
  );
  router.get('/feedback/export', async (req, res) => {
    const filters = parse(filterSchema, req.query);
    const query = filterQuery(filters, req.access);
    res
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="nuvia-feedback.csv"');
    res.write(
      '\uFEFF' +
        csvRow([
          'id',
          'survey',
          'revision',
          'branch',
          'createdAt',
          'language',
          'text',
          'sentiment',
          'analysisStatus',
          'segments',
          'answers',
        ]),
    );
    for await (const response of deps.models.Response.find(query)
      .sort({ createdAt: -1 })
      .lean()
      .cursor()) {
      if (req.destroyed) break;
      res.write(
        csvRow([
          response._id,
          response.surveyTitle,
          response.revision,
          response.branchName,
          response.createdAt.toISOString(),
          response.language,
          response.text,
          response.analysis?.sentiment?.label,
          response.analysisStatus,
          JSON.stringify(response.segments),
          JSON.stringify(response.answers),
        ]),
      );
    }
    res.end();
  });
  router.get('/feedback/:id', async (req, res) =>
    res.json({ response: responseView(await findResponse(uuid(req.params.id), req.access, deps)) }),
  );
  router.get('/analytics', async (req, res) =>
    res.json({
      ...(await analytics(parse(filterSchema, req.query), req.access, deps)),
      capabilities: (await capabilities(deps)).capabilities,
    }),
  );
  router.get('/ai/capabilities', async (_req, res) => res.json(await capabilities(deps)));
  router.get('/analysis/jobs', async (req, res) => {
    const jobs = await deps.models.AnalysisJob.find({
      workspaceId: req.access.workspace._id,
      ...scopedJobs(req.access),
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ jobs: jobs.map(jobView) });
  });
  router.post('/analysis/retry', async (req, res) => {
    requireWrite(req.access);
    const input = parse(
      z.object({ responseId: z.uuid().optional(), filters: filterSchema.optional() }).strict(),
      req.body,
    );
    if (input.responseId) await findResponse(input.responseId, req.access, deps);
    res.json(await retryJobs(req.access, input.responseId, deps, input.filters));
  });
  router.get('/reports', async (req, res) => {
    const reports = await deps.models.Report.find({ workspaceId: req.access.workspace._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ reports: reports.filter((r) => reportAllowed(r, req.access)).map(reportView) });
  });
  router.post('/reports', async (req, res) => {
    requireWrite(req.access);
    const input = parse(z.object({ locale, filters: filterSchema }).strict(), req.body);
    res
      .status(201)
      .json({ report: await createReport({ ...input, userId: req.user.id }, req.access, deps) });
  });
  router.get('/reports/:id/export', async (req, res) =>
    exportReport(
      await findReport(uuid(req.params.id), req.access, deps),
      req.access.workspace.name,
      res,
    ),
  );
  router.get('/reports/:id', async (req, res) =>
    res.json({ report: reportView(await findReport(uuid(req.params.id), req.access, deps)) }),
  );
  router.post('/assistant/messages', async (req, res) => {
    const input = parse(
      z
        .object({ message: z.string().trim().min(1).max(2000), locale, filters: filterSchema })
        .strict(),
      req.body,
    );
    res.json(await assistant(input, req.access, deps));
  });
  router.get('/team', async (req, res) => res.json(await listTeam(req.access, deps)));
  router.post('/team/invitations', async (req, res) =>
    res.status(201).json({
      invitation: await invite(
        parse(z.object({ email, role, branchIds }).strict(), req.body),
        req.access,
        deps,
      ),
    }),
  );
  router.post('/team/accept', async (req, res) => {
    const input = parse(z.object({ token: token.optional() }).strict(), req.body);
    const current = await resolveSession(req, deps);
    res.json(
      await acceptInvitation(input.token, req.user, deps, {
        invitationDigest: current?.session.pendingInvitationDigest,
        sessionId: current?.session._id,
      }),
    );
  });
  router.patch('/team/members/:id', async (req, res) =>
    res.json({
      member: await updateMember(
        uuid(req.params.id),
        parse(
          z
            .object({ role: role.optional(), branchIds: branchIds.optional() })
            .strict()
            .refine((v) => Object.keys(v).length > 0),
          req.body,
        ),
        req.access,
        deps,
      ),
    }),
  );
  router.delete('/team/members/:id', async (req, res) => {
    await revoke('member', uuid(req.params.id), req.access, deps);
    res.sendStatus(204);
  });
  router.delete('/team/invitations/:id', async (req, res) => {
    await revoke('invitation', uuid(req.params.id), req.access, deps);
    res.sendStatus(204);
  });
  router.get('/business-page', async (req, res) => {
    requireWrite(req.access, true);
    res.json(
      pageView(
        await deps.models.BusinessPage.findOne({ workspaceId: req.access.workspace._id }).lean(),
      ),
    );
  });
  router.put('/business-page', async (req, res) =>
    res.json(
      await savePage(
        parse(
          z
            .object({
              slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
              enabled: z.boolean(),
              description: z.string().max(2000),
              logoUrl: safeUrl,
              contactUrl: safeUrl,
            })
            .strict(),
          req.body,
        ),
        req.access,
        deps,
      ),
    ),
  );
  return router;
}
