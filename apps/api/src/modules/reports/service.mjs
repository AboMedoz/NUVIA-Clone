import { randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { filterQuery } from '../feedback/service.mjs';
import { aggregateResponses } from '../analytics/service.mjs';
import { executeTask } from '../../integrations/ai-service/client.mjs';
import { transaction } from '../../shared/database/connection.mjs';

export const reportView = (r) => ({
  id: r._id,
  locale: r.locale,
  status: r.status,
  filters: r.filters,
  metrics: r.metrics,
  evidence: r.evidence,
  snapshot: r.snapshot,
  content: r.content,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
export function reportAllowed(report, access) {
  return !access.branchIds || report.branchIds.every((id) => access.branchIds.includes(id));
}
export async function findReport(id, access, deps) {
  const report = await deps.models.Report.findOne({
    _id: id,
    workspaceId: access.workspace._id,
  }).lean();
  if (!report || !reportAllowed(report, access)) throw new ApiError(404, 'NOT_FOUND');
  return report;
}
export async function evidenceSnapshot(filters, access, deps) {
  const responses = await deps.models.Response.find(filterQuery(filters, access))
    .sort({ createdAt: -1, _id: 1 })
    .lean();
  const textResponses = responses.filter((r) => r.text),
    evidence = [];
  let remaining = 60000,
    shortened = false;
  for (const response of textResponses) {
    if (evidence.length >= 200 || remaining <= 0) break;
    const text = response.text.slice(0, Math.min(10000, remaining));
    shortened ||= text.length < response.text.length;
    remaining -= text.length;
    evidence.push({
      id: response._id,
      text,
      branchId: response.branchId,
      createdAt: response.createdAt,
    });
  }
  return {
    responses,
    evidence,
    snapshot: {
      totalMatched: responses.length,
      totalTextResponses: textResponses.length,
      evidenceCount: evidence.length,
      truncated: shortened || evidence.length < textResponses.length,
      maxItems: 200,
      maxCharacters: 60000,
    },
  };
}
export async function createReport(input, access, deps) {
  const { responses, evidence, snapshot } = await evidenceSnapshot(input.filters, access, deps);
  const report = {
    ...(input.scheduleKey ? { scheduleKey: input.scheduleKey, schedule: input.schedule } : {}),
    _id: randomUUID(),
    workspaceId: access.workspace._id,
    createdBy: input.userId,
    locale: input.locale,
    filters: input.filters,
    branchIds: [...new Set(responses.map((r) => r.branchId))],
    evidence,
    snapshot,
    metrics: aggregateResponses(
      responses,
      access.workspace.reportingTimezone,
      input.filters.interval,
    ),
    status: evidence.length
      ? deps.config.aiServiceKey
        ? 'queued'
        : 'waiting_for_model'
      : 'insufficient_evidence',
    content: null,
    createdAt: deps.now(),
    updatedAt: deps.now(),
  };
  await transaction(deps, async (session) => {
    await deps.models.Report.insertOne(report, { session });
    if (evidence.length)
      await deps.models.AnalysisJob.insertOne(
        {
          _id: randomUUID(),
          workspaceId: report.workspaceId,
          reportId: report._id,
          capability: 'report',
          status: report.status,
          attempts: 0,
          branchIds: report.branchIds,
          createdAt: deps.now(),
          updatedAt: deps.now(),
          error: 'model_unavailable',
          input: {
            taskId: report._id,
            locale: report.locale,
            evidence: evidence.map(({ id, text }) => ({ id, text })),
            parameters: {
              metrics: {
                totalResponses: report.metrics.totalResponses,
                analyzedResponses: report.metrics.analyzedResponses,
                sentimentDistribution: report.metrics.sentimentDistribution,
                aspectScores: report.metrics.aspectScores,
              },
              snapshot,
            },
          },
        },
        { session },
      );
  });
  return reportView(await findReport(report._id, access, deps));
}
export async function assistant(input, access, deps) {
  const { evidence, snapshot } = await evidenceSnapshot(input.filters, access, deps);
  if (!evidence.length) return { answer: null, status: 'insufficient_evidence', evidence: [] };
  // Literal local retrieval restricts generation to a bounded authorized snapshot, never another tenant.
  const terms = input.message
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const ranked = evidence
    .map((e) => ({
      ...e,
      rank: terms.reduce((n, t) => n + (e.text.toLocaleLowerCase().includes(t) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 30);
  const result = await executeTask(
    'assistant',
    {
      taskId: randomUUID(),
      locale: input.locale,
      text: input.message,
      evidence: ranked.map(({ id, text }) => ({ id, text })),
    },
    deps,
  );
  if (result.status !== 'succeeded')
    return {
      answer: null,
      status: result.status === 'unavailable' ? 'model_unavailable' : 'failed',
      evidence: [],
      snapshot,
      capability: 'assistant',
      error: result.error,
    };
  if (result.result.status === 'insufficient_evidence')
    return {
      answer: null,
      status: 'insufficient_evidence',
      evidence: [],
      snapshot,
      modelVersion: result.modelVersion,
      pipelineVersion: result.pipelineVersion,
    };
  return {
    answer: result.result.answer,
    status: 'succeeded',
    evidence: result.result.evidence,
    snapshot: {
      ...snapshot,
      evidenceCount: ranked.length,
      truncated: snapshot.truncated || ranked.length < evidence.length,
    },
    modelVersion: result.modelVersion,
    pipelineVersion: result.pipelineVersion,
  };
}
