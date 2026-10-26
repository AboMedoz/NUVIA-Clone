import { filterQuery } from '../feedback/service.mjs';
import { datasetKey, datasetReadiness } from '../analysis/datasets.mjs';

const weights = { positive: 10, negative: 0, neutral: 5, mixed: 5 };
export const SCORING_VERSION = 'sentence-aspect-mean-v1';
function score(mentions) {
  return {
    score: Number(
      (mentions.reduce((n, m) => n + weights[m.label], 0) / mentions.length).toFixed(2),
    ),
    mentions: mentions.length,
    lowSample: mentions.length < 10,
    scoringVersion: SCORING_VERSION,
  };
}
function period(date, timezone, interval) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  let value = `${get('year')}-${get('month')}-${get('day')}`;
  if (interval === 'month') value = value.slice(0, 7);
  if (interval === 'week') {
    const d = new Date(value + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    value = d.toISOString().slice(0, 10);
  }
  return value;
}
export function aggregateResponses(responses, timezone = 'Africa/Cairo', interval = 'day') {
  const ratings = [];
  const sentiments = {},
    aspects = new Map(),
    series = new Map(),
    comparisons = new Map(),
    segmentGroups = new Map();
  for (const r of responses) {
    const label = r.analysis?.sentiment?.label;
    if (label) sentiments[label] = (sentiments[label] || 0) + 1;
    const p = period(r.createdAt, timezone, interval);
    if (!series.has(p))
      series.set(p, {
        date: p,
        totalResponses: 0,
        sentimentDistribution: {},
        aspects: new Map(),
        ratings: [],
      });
    const bucket = series.get(p);
    bucket.totalResponses++;
    if (label) bucket.sentimentDistribution[label] = (bucket.sentimentDistribution[label] || 0) + 1;
    if (!comparisons.has(r.branchId))
      comparisons.set(r.branchId, {
        branchId: r.branchId,
        branchName: r.branchName,
        totalResponses: 0,
        sentimentDistribution: {},
        aspects: new Map(),
        ratings: [],
      });
    const branch = comparisons.get(r.branchId);
    const ratingQuestions = new Map(
      (r.questions || []).filter((q) => q.type === 'rating').map((q) => [q.id, q.ratingMax || 5]),
    );
    for (const answer of r.answers || []) {
      if (
        ratingQuestions.has(answer.questionId) &&
        Number.isInteger(answer.value) &&
        answer.value >= 1 &&
        answer.value <= ratingQuestions.get(answer.questionId)
      ) {
        ratings.push((answer.value * 5) / ratingQuestions.get(answer.questionId));
        bucket.ratings.push((answer.value * 5) / ratingQuestions.get(answer.questionId));
        branch.ratings.push((answer.value * 5) / ratingQuestions.get(answer.questionId));
      }
    }
    branch.totalResponses++;
    if (label) branch.sentimentDistribution[label] = (branch.sentimentDistribution[label] || 0) + 1;
    for (const mention of r.analysis?.aspects?.mentions || []) {
      for (const map of [aspects, bucket.aspects, branch.aspects]) {
        if (!map.has(mention.aspect)) map.set(mention.aspect, []);
        map.get(mention.aspect).push(mention);
      }
    }
    for (const [questionId, values] of Object.entries(r.segments || {}))
      for (const value of Array.isArray(values) ? values : [values]) {
        const key = `${questionId}:${value}`;
        if (!segmentGroups.has(key))
          segmentGroups.set(key, {
            questionId,
            value,
            totalResponses: 0,
            sentimentDistribution: {},
          });
        const segment = segmentGroups.get(key);
        segment.totalResponses++;
        if (label)
          segment.sentimentDistribution[label] = (segment.sentimentDistribution[label] || 0) + 1;
      }
  }
  const ratingMetrics = (values) => ({
    averageRating: values.length
      ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
      : null,
    ratingAnswerCount: values.length,
  });
  const aspectScores = (map) =>
    [...map].map(([aspect, mentions]) => ({ aspect, ...score(mentions) }));
  const trends = [...series.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ aspects, ratings: values, ...bucket }) => ({
      ...bucket,
      ...ratingMetrics(values),
      aspectScores: aspectScores(aspects),
    }));
  const analyzedResponses = responses.filter((r) => r.analysisStatus === 'succeeded').length;
  const alerts = [];
  // Deterministic, explicitly versioned observed change alerts; never forecasts.
  for (let index = 1; index < trends.length; index++)
    for (const current of trends[index].aspectScores) {
      const previous = trends[index - 1].aspectScores.find((a) => a.aspect === current.aspect);
      if (
        previous &&
        !current.lowSample &&
        !previous.lowSample &&
        current.score - previous.score <= -2
      )
        alerts.push({
          type: 'observed_decline',
          aspect: current.aspect,
          from: trends[index - 1].date,
          to: trends[index].date,
          change: Number((current.score - previous.score).toFixed(2)),
          method: 'adjacent-period-drop-v1',
          threshold: 2,
          minimumMentions: 10,
        });
    }
  return {
    totalResponses: responses.length,
    ...ratingMetrics(ratings),
    analyzedResponses,
    pendingResponses: responses.length - analyzedResponses,
    sentimentDistribution: sentiments,
    aspectScores: aspectScores(aspects),
    trends,
    comparisons: [...comparisons.values()].map(({ aspects, ratings: values, ...branch }) => ({
      ...branch,
      ...ratingMetrics(values),
      aspectScores: aspectScores(aspects),
    })),
    segmentComparisons: [...segmentGroups.values()],
    topics: [],
    forecasts: [],
    alerts,
    reportingTimezone: timezone,
    interval,
  };
}
export async function analytics(filters, access, deps) {
  const responses = await deps.models.Response.find(filterQuery(filters, access)).lean();
  const metrics = aggregateResponses(
    responses,
    access.workspace.reportingTimezone,
    filters.interval,
  );
  const completionSupported =
    !filters.language &&
    !filters.sentiment &&
    !filters.aspect &&
    !filters.search &&
    !filters.segment;
  metrics.completionMethod = 'first-interaction-session-v1';
  metrics.startedSessions = null;
  metrics.completedSessions = null;
  metrics.completionRate = null;
  if (completionSupported) {
    const startQuery = filterQuery(filters, access);
    const [started, completed] = await Promise.all([
      deps.models.SurveyStart.countDocuments(startQuery),
      deps.models.SurveyStart.countDocuments({ ...startQuery, completedAt: { $ne: null } }),
    ]);
    metrics.startedSessions = started;
    metrics.completedSessions = completed;
    metrics.completionRate = started ? completed / started : null;
  }
  const readiness = datasetReadiness(responses, metrics),
    key = datasetKey(responses, filters.interval, access.workspace.reportingTimezone);
  const jobs = await deps.models.AnalysisJob.find({
    workspaceId: access.workspace._id,
    datasetKey: key,
    capability: { $in: ['clustering', 'forecasting'] },
  }).lean();
  const ids = new Set(responses.map((r) => r._id));
  const cluster = jobs.find((j) => j.capability === 'clustering' && j.status === 'succeeded');
  const summaries = cluster
    ? await deps.models.AnalysisJob.find({
        workspaceId: access.workspace._id,
        parentJobId: cluster._id,
        purpose: 'cluster_summary',
      })
        .sort({ createdAt: -1 })
        .lean()
    : [];
  if (cluster)
    metrics.topics = cluster.result.clusters
      .filter((c) => c.memberIds.every((id) => ids.has(id)))
      .map((c) => {
        const child = summaries.find(
          (job) =>
            job.clusterId === c.id &&
            job.input?.evidence?.every((e) => c.memberIds.includes(e.id) && ids.has(e.id)),
        );
        const summary = child?.status === 'succeeded' ? child.result : null;
        return {
          ...c,
          labelKind: 'cluster_identifier',
          summaryStatus: child?.status || 'awaiting_analysis',
          summary: summary?.summary || null,
          summaryTitle: summary?.title || null,
          summaryEvidence: summary?.evidence || [],
          summaryCoverage: child?.input.parameters.coverage || null,
          summaryModelVersion: summary ? child.modelVersion : null,
          summaryPipelineVersion: summary ? child.pipelineVersion : null,
          count: c.memberIds.length,
          modelVersion: cluster.modelVersion,
          pipelineVersion: cluster.pipelineVersion,
          evidence: c.evidenceIds.map((id) => ({
            id,
            text: responses.find((r) => r._id === id)?.text,
          })),
          emerging:
            c.memberIds.length >= 3 &&
            c.memberIds.every(
              (id) =>
                responses.find((r) => r._id === id)?.createdAt >=
                new Date(deps.now().getTime() - 7 * 86400000),
            ),
          emergingMethod: 'all-members-observed-in-last-seven-days-v1',
        };
      });
  const forecast = jobs.find((j) => j.capability === 'forecasting' && j.status === 'succeeded');
  if (forecast)
    metrics.forecasts = [
      {
        ...forecast.result,
        modelVersion: forecast.modelVersion,
        pipelineVersion: forecast.pipelineVersion,
      },
    ];
  metrics.atRiskAspects = metrics.aspectScores
    .filter((a) => !a.lowSample && a.score < 4)
    .map((a) => ({ ...a, basis: 'observed-score-below-four-v1' }));
  metrics.capabilityStates = Object.fromEntries(
    Object.entries(readiness).map(([capability, state]) => {
      const job = jobs.find((j) => j.capability === capability);
      return [
        capability,
        {
          ...state,
          status: !state.sufficient ? 'insufficient_evidence' : job?.status || 'awaiting_analysis',
          error: job?.error || null,
          evaluatedResponses:
            capability === 'clustering' ? job?.input?.evidence?.length || 0 : undefined,
          sampled:
            capability === 'clustering' ? job?.input?.parameters?.sampled || false : undefined,
        },
      ];
    }),
  );
  return metrics;
}
