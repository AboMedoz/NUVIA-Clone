import { z, parse } from '../../shared/validation.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { branchAllowed, scopedBranches } from '../team/access.mjs';
export const filterSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    expectedWorkspaceId: z.uuid().optional(),
    order: z.enum(['newest', 'oldest']).default('newest'),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().max(200).optional(),
    branchId: z.uuid().optional(),
    surveyId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    language: z.enum(['ar', 'en', 'mixed', 'unknown']).optional(),
    sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
    aspect: z.string().min(1).max(100).optional(),
    segment: z
      .union([z.string().max(4000), z.record(z.string(), z.union([z.string(), z.number()]))])
      .optional(),
    interval: z.enum(['day', 'week', 'month']).default('day'),
  })
  .strict()
  .refine((f) => !f.from || !f.to || new Date(f.from) <= new Date(f.to));
export function filterQuery(filters, access) {
  if (filters.branchId) branchAllowed(access, filters.branchId);
  const query = { workspaceId: access.workspace._id, ...scopedBranches(access) };
  if (filters.branchId) query.branchId = filters.branchId;
  if (filters.surveyId) query.surveyId = filters.surveyId;
  if (filters.language) query.language = filters.language;
  if (filters.from || filters.to)
    query.createdAt = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {}),
    };
  if (filters.search)
    query.text = { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (filters.sentiment) query['analysis.sentiment.label'] = filters.sentiment;
  if (filters.aspect)
    query['analysis.aspects.mentions'] = { $elemMatch: { aspect: filters.aspect } };
  if (filters.segment) {
    let segment = filters.segment;
    if (typeof segment === 'string') {
      try {
        segment = JSON.parse(segment);
      } catch {
        throw new ApiError(422, 'VALIDATION_ERROR');
      }
    }
    segment = parse(
      z.record(z.uuid(), z.union([z.string().max(200), z.number().finite()])),
      segment,
    );
    for (const [id, value] of Object.entries(segment)) query[`segments.${id}`] = value;
  }
  return query;
}
export const responseView = (r) => ({
  id: r._id,
  surveyId: r.surveyId,
  surveyTitle: r.surveyTitle,
  revision: r.revision,
  branchId: r.branchId,
  branchName: r.branchName,
  answers: r.answers,
  ...(r.respondent ? { respondent: r.respondent } : {}),
  questions: r.questions,
  text: r.text,
  segments: r.segments,
  language: r.language,
  createdAt: r.createdAt,
  analysisStatus: r.analysisStatus,
  analysis: r.analysis || null,
  preprocessing: r.preprocessing || null,
  languageDetails: r.languageDetails || null,
});
export async function listFeedback(filters, access, deps) {
  const query = filterQuery(filters, access),
    total = await deps.models.Response.countDocuments(query);
  const responses = await deps.models.Response.find(query)
    .sort({
      createdAt: filters.order === 'oldest' ? 1 : -1,
      _id: filters.order === 'oldest' ? 1 : -1,
    })
    .skip((filters.page - 1) * filters.pageSize)
    .limit(filters.pageSize)
    .lean();
  return {
    responses: responses.map(responseView),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
export async function findResponse(id, access, deps) {
  const response = await deps.models.Response.findOne({
    _id: id,
    workspaceId: access.workspace._id,
    ...scopedBranches(access),
  }).lean();
  if (!response) throw new ApiError(404, 'NOT_FOUND');
  return response;
}
export async function responseNavigation(response, access, deps) {
  const scope = { workspaceId: access.workspace._id, ...scopedBranches(access) };
  const neighbor = async (direction) => {
    const operator = direction === 1 ? '$gt' : '$lt';
    const result = await deps.models.Response.findOne({
      ...scope,
      $or: [
        { createdAt: { [operator]: response.createdAt } },
        { createdAt: response.createdAt, _id: { [operator]: response._id } },
      ],
    })
      .sort({ createdAt: direction, _id: direction })
      .select('_id')
      .lean();
    return result?._id || null;
  };
  const [previousId, nextId] = await Promise.all([neighbor(1), neighbor(-1)]);
  return { previousId, nextId };
}
export function csvRow(values) {
  return (
    values
      .map((value) => {
        let string = String(value ?? '');
        if (/^[=+\-@\t\r]/.test(string)) string = `'${string}`;
        return `"${string.replaceAll('"', '""')}"`;
      })
      .join(',') + '\r\n'
  );
}
