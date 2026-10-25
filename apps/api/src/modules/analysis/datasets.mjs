import { randomUUID, createHash } from 'node:crypto';
import { filterQuery } from '../feedback/service.mjs';
import { aggregateResponses } from '../analytics/service.mjs';
import { queueClusterSummaries } from './summaries.mjs';
export const VECTOR_PARAMETERS_BUDGET_BYTES = 120000;

function pythonNumberSizeUpperBound(value) {
  const wire = JSON.stringify(value);
  // json.loads keeps integer wire tokens as arbitrary-precision ints: their
  // compact decimal spelling is unchanged, even when JS held a large double.
  if (!/[.e]/i.test(wire)) return wire.length;
  const [coefficient, exponentText] = Math.abs(value).toExponential().split('e');
  const digits = coefficient.replace('.', '').length,
    exponent = Number(exponentText);
  const sign = value < 0 ? 1 : 0;
  let maximum = wire.length;
  // The JS spelling is a valid round-trip candidate for the same binary64.
  // Python's shortest repr therefore needs no more significant digits. A
  // rounding boundary can cross at most one decimal decade. Bound every
  // adjacent exponent, including Python's fixed/scientific switch and its
  // mandatory two-digit exponent (1e-7 -> 1e-07), without altering values.
  for (const candidate of [exponent - 1, exponent, exponent + 1]) {
    let size;
    if (candidate < -4 || candidate >= 16) {
      size = digits + (digits > 1 ? 1 : 0) + 2 + Math.max(2, String(Math.abs(candidate)).length);
    } else if (candidate < 0) {
      size = 2 + -candidate - 1 + digits;
    } else {
      const beforePoint = candidate + 1;
      size = beforePoint + 1 + Math.max(1, digits - beforePoint);
    }
    maximum = Math.max(maximum, sign + size);
  }
  return maximum;
}

export function parameterSizeUpperBound(value) {
  const wireBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  function numericOverhead(item) {
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Parameters require finite numbers');
      return pythonNumberSizeUpperBound(item) - JSON.stringify(item).length;
    }
    if (Array.isArray(item)) return item.reduce((sum, child) => sum + numericOverhead(child), 0);
    if (item && typeof item === 'object')
      return Object.values(item).reduce((sum, child) => sum + numericOverhead(child), 0);
    return 0;
  }
  // Strings and structure use the same compact UTF-8 spelling; only add positive
  // number-format differences, so this bounds both JS wire and Python re-encoding.
  return wireBytes + numericOverhead(value);
}

function orderedTexts(responses) {
  return responses
    .filter((response) => response.text?.trim())
    .sort((a, b) => b.createdAt - a.createdAt || a._id.localeCompare(b._id));
}
export function buildClusteringSample(responses) {
  const texts = orderedTexts(responses),
    available = texts.filter((response) =>
      response.analysis?.embeddings?.vectors?.some((vector) => vector.id === response._id),
    );
  // Equal dimensions do not make embeddings from different encoders comparable.
  // Select the largest coherent space; insertion order breaks ties by newest row.
  const spaces = new Map();
  for (const response of available) {
    const embedding = response.analysis.embeddings;
    const vector = embedding.vectors.find((item) => item.id === response._id);
    const key = JSON.stringify([
      embedding.modelVersion || null,
      embedding.pipelineVersion || null,
      vector.values.length,
    ]);
    if (!spaces.has(key)) spaces.set(key, []);
    spaces.get(key).push(response);
  }
  const cohort = [...spaces.values()].sort((a, b) => b.length - a.length)[0];
  const selected = [],
    evidence = [],
    vectors = [];
  let remaining = 60000;
  const parameters = () => ({
    vectors,
    sampleCount: evidence.length,
    totalResponses: responses.length,
    totalTextResponses: texts.length,
    sampled: selected.length < texts.length,
    truncatedText: selected.some(
      (response, index) => response.text.length > evidence[index].text.length,
    ),
    vectorBudgetBytes: VECTOR_PARAMETERS_BUDGET_BYTES,
  });
  for (const response of cohort || texts) {
    if (selected.length >= 200 || remaining <= 0) break;
    const vector = response.analysis?.embeddings?.vectors?.find(
      (value) => value.id === response._id,
    );
    if (vector && vectors.length && vector.values.length !== vectors[0].values.length) continue;
    const text = response.text.slice(0, Math.min(10000, remaining));
    selected.push(response);
    evidence.push({ id: response._id, text });
    if (vector) vectors.push(vector);
    if (parameterSizeUpperBound(parameters()) > VECTOR_PARAMETERS_BUDGET_BYTES) {
      selected.pop();
      evidence.pop();
      if (vector) vectors.pop();
      break;
    }
    remaining -= text.length;
  }
  return { evidence, parameters: parameters() };
}
export function datasetKey(responses, interval, timezone) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        transportVersion: 'vector-aware-v4-provider-cohorts',
        interval,
        timezone,
        rows: responses
          .map((r) => [
            r._id,
            r.analysis?.sentiment?.modelVersion || null,
            r.analysis?.aspects?.modelVersion || null,
            r.analysis?.embeddings?.modelVersion || null,
            r.analysis?.sentiment?.pipelineVersion || null,
            r.analysis?.aspects?.pipelineVersion || null,
            r.analysis?.embeddings?.pipelineVersion || null,
          ])
          .sort((a, b) => a[0].localeCompare(b[0])),
      }),
    )
    .digest('hex');
}
export function datasetReadiness(responses, metrics) {
  const texts = responses.filter((r) => r.text?.trim()).length;
  const reliablePeriods = metrics.trends.filter((t) =>
    t.aspectScores.some((a) => !a.lowSample),
  ).length;
  return {
    clustering: { sufficient: texts >= 5, sampleCount: texts, minimumResponses: 5 },
    forecasting: {
      sufficient: reliablePeriods >= 30,
      sampleCount: reliablePeriods,
      minimumPeriods: 30,
      minimumMentionsPerPeriod: 10,
    },
  };
}
export async function queueDatasetJobs(access, filters, deps) {
  const responses = await deps.models.Response.find(filterQuery(filters, access)).lean();
  const metrics = aggregateResponses(
    responses,
    access.workspace.reportingTimezone,
    filters.interval,
  );
  const readiness = datasetReadiness(responses, metrics),
    key = datasetKey(responses, filters.interval, access.workspace.reportingTimezone);
  const jobs = [];
  for (const capability of ['clustering', 'forecasting']) {
    if (!readiness[capability].sufficient) continue;
    const id = randomUUID();
    const selected = [],
      evidence = [];
    let remaining = 60000;
    for (const response of responses
      .filter((r) => r.text)
      .sort((a, b) => b.createdAt - a.createdAt)) {
      if (selected.length >= 200 || remaining <= 0) break;
      const text = response.text.slice(0, Math.min(10000, remaining));
      remaining -= text.length;
      selected.push(response);
      evidence.push({ id: response._id, text });
    }
    const clusterSample = capability === 'clustering' ? buildClusteringSample(responses) : null;
    const observations = metrics.trends
      .filter((t) => t.aspectScores.some((a) => !a.lowSample))
      .map((t) => ({
        date: t.date.length === 7 ? `${t.date}-01` : t.date,
        value:
          t.aspectScores.reduce((sum, a) => sum + a.score * a.mentions, 0) /
          t.aspectScores.reduce((sum, a) => sum + a.mentions, 0),
      }))
      .slice(-365);
    const last = observations.at(-1)?.date,
      futureDates = [];
    if (last)
      for (let offset = 1; offset <= 7; offset++) {
        const next = new Date(`${last}T12:00:00Z`);
        if (filters.interval === 'month') next.setUTCMonth(next.getUTCMonth() + offset);
        else next.setUTCDate(next.getUTCDate() + offset * (filters.interval === 'week' ? 7 : 1));
        futureDates.push(next.toISOString().slice(0, 10));
      }
    await deps.models.AnalysisJob.updateOne(
      { workspaceId: access.workspace._id, capability, datasetKey: key },
      {
        $setOnInsert: {
          _id: id,
          workspaceId: access.workspace._id,
          capability,
          datasetKey: key,
          branchIds: [...new Set(responses.map((r) => r.branchId))],
          status: 'waiting_for_model',
          attempts: 0,
          createdAt: deps.now(),
          updatedAt: deps.now(),
          error: 'model_unavailable',
          input: {
            taskId: id,
            locale: access.workspace.locale,
            evidence: clusterSample ? clusterSample.evidence : evidence,
            parameters:
              capability === 'clustering'
                ? clusterSample.parameters
                : {
                    observations,
                    futureDates,
                    sampleCount: observations.length,
                    interval: filters.interval,
                    metric: 'weighted-mean-aspect-score',
                    scoringVersion: 'sentence-aspect-mean-v1',
                    reportingTimezone: access.workspace.reportingTimezone,
                  },
          },
        },
      },
      { upsert: true },
    );
    const saved = await deps.models.AnalysisJob.findOne({
      workspaceId: access.workspace._id,
      capability,
      datasetKey: key,
    }).lean();
    jobs.push(saved);
    if (saved.capability === 'clustering' && saved.status === 'succeeded')
      await queueClusterSummaries(saved, deps);
  }
  return jobs;
}
