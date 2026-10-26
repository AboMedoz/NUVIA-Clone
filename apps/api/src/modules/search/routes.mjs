import { Router } from 'express';
import { z, parse } from '../../shared/validation.mjs';
import { requireVerifiedUser } from '../auth/sessions.mjs';
import { createLimiter } from '../../middleware/rate-limits.mjs';
import { resolveAccess, branchAllowed } from '../team/access.mjs';
import { filterSchema, listFeedback } from '../feedback/service.mjs';
import { listSurveys } from '../surveys/service.mjs';
import { reportAllowed } from '../reports/service.mjs';

const inputSchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    branchId: z.uuid().optional(),
  })
  .strict();
const matches = (value, query) =>
  String(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .includes(query.normalize('NFKC').toLocaleLowerCase());

export function searchRoutes(deps) {
  const router = Router(),
    limit = createLimiter(deps);
  router.get('/search', async (req, res) => {
    const user = await requireVerifiedUser(req, deps);
    limit('search:' + user.id, 120, 900000, res);
    const { q, branchId } = parse(inputSchema, req.query);
    const access = await resolveAccess(user.id, deps);
    if (branchId) branchAllowed(access, branchId);
    // An empty assigned scope grants no data, including unpublished surveys or empty reports.
    if (!q || (access.branchIds && !access.branchIds.length)) return res.json({ results: [] });
    const titlePattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const reportTitles = [{ 'content.title': titlePattern }];
    if (matches('Customer feedback report', q))
      reportTitles.push({ locale: 'en', 'content.title': { $in: [null, ''] } });
    if (matches('تقرير آراء العملاء', q))
      reportTitles.push({ locale: 'ar', 'content.title': { $in: [null, ''] } });
    const [feedback, surveys, reports] = await Promise.all([
      listFeedback(
        parse(filterSchema, { search: q, ...(branchId ? { branchId } : {}), pageSize: 4 }),
        access,
        deps,
      ),
      listSurveys(access, deps),
      deps.models.Report.find({
        workspaceId: access.workspace._id,
        $or: reportTitles,
        ...(access.branchIds || branchId
          ? {
              branchIds: {
                ...(access.branchIds
                  ? { $not: { $elemMatch: { $nin: access.branchIds } }, $ne: [] }
                  : {}),
                ...(branchId ? { $all: [branchId] } : {}),
              },
            }
          : {}),
      })
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),
    ]);
    const results = [
      ...feedback.responses.map((r) => ({
        id: r.id,
        title: r.text.slice(0, 240),
        section: 'Feedbacks',
        description: [r.surveyTitle, r.branchName].filter(Boolean).join(' · '),
        path: '#/feedback-details?id=' + encodeURIComponent(r.id),
      })),
      ...surveys
        .filter(
          (s) =>
            matches(s.title, q) &&
            (!branchId || s.links.some((link) => link.branchId === branchId)),
        )
        .slice(0, 4)
        .map((s) => ({
          id: s.id,
          title: s.title,
          section: 'Surveys',
          description: s.status,
          path: '#/survey-edit?id=' + encodeURIComponent(s.id),
        })),
      ...reports
        .filter(
          (report) =>
            reportAllowed(report, access) && (!access.branchIds || report.branchIds.length > 0),
        )
        .map((report) => ({
          report,
          title:
            report.content?.title ||
            (report.locale === 'ar' ? 'تقرير آراء العملاء' : 'Customer feedback report'),
        }))
        .filter(({ title }) => matches(title, q))
        .slice(0, 4)
        .map(({ report, title }) => ({
          id: report._id,
          title,
          section: 'Reports',
          description: report.status,
          path: '#/report-details?id=' + encodeURIComponent(report._id),
        })),
    ];
    res.json({ results });
  });
  return router;
}
