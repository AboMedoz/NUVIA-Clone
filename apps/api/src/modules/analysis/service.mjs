import { randomUUID } from 'node:crypto';
import { executeTask } from '../../integrations/ai-service/client.mjs';
import { scopedJobs } from '../team/access.mjs';
import { queueDatasetJobs } from './datasets.mjs';
import { filterSchema } from '../feedback/service.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { queueClusterSummaries } from './summaries.mjs';
import { emitWorkspaceNotification } from '../notifications/service.mjs';

export async function queueResponseJobs(response, deps, session) {
  if (!response.text) return;
  for (const capability of ['normalization', 'language', 'sentiment', 'aspects', 'embeddings']) {
    await deps.models.AnalysisJob.insertOne(
      {
        _id: randomUUID(),
        workspaceId: response.workspaceId,
        branchId: response.branchId,
        responseId: response._id,
        capability,
        status: deps.config.aiServiceKey ? 'queued' : 'waiting_for_model',
        attempts: 0,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        error: deps.config.aiServiceKey ? null : 'model_unavailable',
      },
      { session },
    );
  }
}
export const jobView = (j) => ({
  id: j._id,
  responseId: j.responseId,
  reportId: j.reportId,
  parentJobId: j.parentJobId,
  clusterId: j.clusterId,
  purpose: j.purpose,
  capability: j.capability,
  status: j.status,
  attempts: j.attempts,
  error: j.error,
  createdAt: j.createdAt,
  updatedAt: j.updatedAt,
  modelVersion: j.modelVersion,
  pipelineVersion: j.pipelineVersion,
});

export async function runJob(job, deps) {
  const now = deps.now(),
    leaseId = randomUUID();
  const claimed = await deps.models.AnalysisJob.findOneAndUpdate(
    {
      _id: job._id,
      attempts: job.attempts,
      $or: [
        { status: { $in: ['queued', 'waiting_for_model', 'failed'] } },
        { status: 'running', leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'running',
        leaseId,
        updatedAt: now,
        leaseUntil: new Date(now.getTime() + 150000),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) return;
  const response =
    job.responseId &&
    (await deps.models.Response.findOne({
      _id: job.responseId,
      workspaceId: job.workspaceId,
    }).lean());
  if (job.responseId && !response) return;
  const input = job.input || {
    taskId: job._id,
    locale: response.submittedLocale,
    text: response.text,
    sentences: response.preprocessing?.sentences,
    evidence: [{ id: response._id, text: response.text }],
  };
  let result;
  if (job.capability === 'clustering' && input.evidence.length < 5) {
    result = { status: 'unavailable', error: 'insufficient_vector_budget' };
  } else if (
    job.capability === 'clustering' &&
    input.parameters?.vectors?.length !== input.evidence?.length
  ) {
    result = { status: 'unavailable', error: 'embeddings_unavailable' };
  } else if (
    ['sentiment', 'aspects'].includes(job.capability) &&
    !response?.preprocessing?.sentences &&
    response
  ) {
    result = { status: 'unavailable', error: 'preprocessing_unavailable' };
  } else result = await executeTask(job.capability, input, deps);
  const status = result.status === 'unavailable' ? 'waiting_for_model' : result.status;
  const update = {
    status,
    error: result.error || null,
    updatedAt: deps.now(),
    leaseUntil: null,
    leaseId: null,
    nextAttemptAt:
      status === 'failed' && result.error === 'service_unavailable' && claimed.attempts < 5
        ? new Date(deps.now().getTime() + Math.min(300000, 1000 * 2 ** claimed.attempts))
        : null,
  };
  if (result.status === 'succeeded')
    Object.assign(update, {
      result: result.result,
      modelVersion: result.modelVersion,
      pipelineVersion: result.pipelineVersion,
    });
  const reportCompleted = await transaction(deps, async (session) => {
    const saved = await deps.models.AnalysisJob.updateOne(
      { _id: job._id, status: 'running', leaseId },
      {
        $set: update,
        ...(result.status === 'succeeded'
          ? {
              $push: {
                provenance: {
                  modelVersion: result.modelVersion,
                  pipelineVersion: result.pipelineVersion,
                  result: result.result,
                  createdAt: deps.now(),
                },
              },
            }
          : {}),
      },
      { session },
    );
    if (!saved.matchedCount) return;
    if (job.capability === 'clustering' && result.status === 'succeeded')
      await queueClusterSummaries(
        {
          ...claimed,
          ...update,
        },
        deps,
        session,
      );
    if (response) {
      if (result.status === 'succeeded') {
        const set =
          job.capability === 'normalization'
            ? { preprocessing: result.result }
            : job.capability === 'language'
              ? {
                  language: result.result.language === 'und' ? 'unknown' : result.result.language,
                  languageDetails: result.result,
                }
              : {
                  [`analysis.${job.capability}`]: {
                    ...result.result,
                    modelVersion: result.modelVersion,
                    pipelineVersion: result.pipelineVersion,
                  },
                };
        // Initialize the analysis object without applying dotted updates to a null value.
        if (!['normalization', 'language'].includes(job.capability))
          await deps.models.Response.updateOne(
            { _id: response._id, analysis: null },
            { $set: { analysis: {} } },
            { session },
          );
        await deps.models.Response.updateOne({ _id: response._id }, { $set: set }, { session });
      }
      const jobs = await deps.models.AnalysisJob.find({ responseId: response._id }, null, {
        session,
      }).lean();
      const scientific = jobs.filter((j) => ['sentiment', 'aspects'].includes(j.capability));
      const analysisStatus = scientific.every((j) => j.status === 'succeeded')
        ? 'succeeded'
        : scientific.some((j) => j.status === 'succeeded')
          ? 'partial'
          : scientific.some((j) => j.status === 'failed')
            ? 'failed'
            : 'waiting_for_model';
      await deps.models.Response.updateOne(
        { _id: response._id },
        { $set: { analysisStatus } },
        { session },
      );
    }
    if (job.reportId)
      await deps.models.Report.updateOne(
        { _id: job.reportId, workspaceId: job.workspaceId },
        {
          $set: {
            status,
            content: result.status === 'succeeded' ? result.result : null,
            updatedAt: deps.now(),
          },
        },
        { session },
      );
    return Boolean(job.reportId && status === 'succeeded');
  });
  if (reportCompleted)
    await emitWorkspaceNotification(
      job.workspaceId,
      {
        type: 'reports',
        title: 'Your report is ready',
        body: 'Open the saved report to review the analysis and supporting evidence.',
        path: '/report-details?id=' + job.reportId,
        branchIds: job.branchIds,
      },
      deps,
    ).catch(() => {});
}
export async function retryJobs(access, responseId, deps, filters = filterSchema.parse({})) {
  const query = {
    workspaceId: access.workspace._id,
    ...scopedJobs(access),
    ...(responseId ? { responseId } : {}),
    status: { $in: ['queued', 'failed', 'waiting_for_model'] },
  };
  const jobs = await deps.models.AnalysisJob.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .limit(100)
    .lean();
  const datasets = await queueDatasetJobs(access, filters, deps);
  if (deps.config.aiServiceKey) {
    const ids = [...jobs, ...datasets.filter((job) => job.status !== 'succeeded')].map(
      (job) => job._id,
    );
    await deps.models.AnalysisJob.updateMany(
      { _id: { $in: ids }, status: { $in: ['queued', 'failed', 'waiting_for_model'] } },
      { $set: { status: 'queued', updatedAt: deps.now(), nextAttemptAt: null, error: null } },
    );
    const reportIds = jobs.filter((job) => job.reportId).map((job) => job.reportId);
    await deps.models.Report.updateMany(
      { _id: { $in: reportIds }, workspaceId: access.workspace._id },
      { $set: { status: 'queued', updatedAt: deps.now() } },
    );
  }
  return {
    jobs: (
      await deps.models.AnalysisJob.find(
        query.status ? { ...query, status: { $exists: true } } : query,
      )
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ).map(jobView),
  };
}

export async function runPendingAnalysis(deps, { limit = 50 } = {}) {
  const now = deps.now();
  const jobs = await deps.models.AnalysisJob.find({
    $or: [
      { status: 'queued' },
      { status: 'failed', nextAttemptAt: { $ne: null, $lte: now } },
      { status: 'running', leaseUntil: { $lte: now } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  // Select runnable work before applying the batch limit. Missing learned models
  // must never monopolize an old-createdAt prefix and starve new builtin tasks.
  if (jobs.length < limit)
    jobs.push(
      ...(await deps.models.AnalysisJob.find({
        status: 'waiting_for_model',
        updatedAt: { $lte: new Date(now.getTime() - 30000) },
      })
        .sort({ updatedAt: 1, createdAt: 1, _id: 1 })
        .limit(limit - jobs.length)
        .lean()),
    );
  const order = ['normalization', 'language', 'sentiment', 'aspects', 'embeddings'];
  jobs.sort((a, b) => order.indexOf(a.capability) - order.indexOf(b.capability));
  for (const job of jobs) await runJob(job, deps);
  // Refresh complete-workspace and individual-branch datasets after response jobs progress.
  const workspaceIds = [...new Set(jobs.filter((j) => j.responseId).map((j) => j.workspaceId))];
  for (const workspaceId of workspaceIds) {
    const workspace = await deps.models.Workspace.findOne({ _id: workspaceId }).lean();
    if (!workspace) continue;
    const access = { workspace, role: 'owner', branchIds: null },
      filters = filterSchema.parse({});
    await queueDatasetJobs(access, filters, deps);
    const branches = await deps.models.Branch.find({ workspaceId }).lean();
    for (const branch of branches)
      await queueDatasetJobs(access, { ...filters, branchId: branch._id }, deps);
  }
  return { processed: jobs.length };
}
