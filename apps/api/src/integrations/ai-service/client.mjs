import { z } from '../../shared/validation.mjs';
import { questionSchema } from '../../modules/surveys/validation.mjs';

export const CAPABILITIES = [
  'normalization',
  'language',
  'sentiment',
  'aspects',
  'embeddings',
  'clustering',
  'forecasting',
  'report',
  'assistant',
  'survey_generation',
];
export async function capabilities(deps) {
  if (!deps.config.aiServiceKey)
    return {
      schemaVersion: 1,
      capabilities: CAPABILITIES.map((capability) => ({
        capability,
        available: false,
        status: 'unavailable',
        reason: 'service_not_configured',
      })),
    };
  try {
    const response = await fetch(`${deps.config.aiServiceUrl}/api/v1/capabilities`, {
      headers: { 'X-AI-Service-Key': deps.config.aiServiceKey },
      signal: AbortSignal.timeout(deps.config.aiTimeoutMs),
    });
    if (!response.ok) throw new Error('Unavailable');
    const value = await response.json();
    const parsed = z
      .object({
        schemaVersion: z.literal(1),
        pipelineVersion: z.string(),
        capabilities: z.array(
          z.object({
            capability: z.enum(CAPABILITIES),
            available: z.boolean(),
            status: z.enum(['ready', 'unavailable', 'invalid']),
            modelVersion: z.string().optional(),
            reason: z.string().optional(),
          }),
        ),
      })
      .safeParse(value);
    if (!parsed.success) throw new Error('Invalid capability registry');
    return parsed.data;
  } catch {
    return {
      schemaVersion: 1,
      capabilities: CAPABILITIES.map((capability) => ({
        capability,
        available: false,
        status: 'unavailable',
        reason: 'service_unavailable',
      })),
    };
  }
}
const label = z.enum(['positive', 'negative', 'neutral', 'mixed']);
const confidence = z.number().min(0).max(1).optional();
const citation = z.object({ id: z.string(), quote: z.string().min(1) }).strict();
export function validateResult(capability, value, input) {
  const schemas = {
    normalization: z.object({
      text: z.string(),
      normalizedText: z.string(),
      sentences: z.array(
        z.object({
          id: z.string(),
          start: z.number().int().min(0),
          end: z.number().int().min(0),
          text: z.string(),
        }),
      ),
      method: z.string(),
    }),
    language: z.object({
      language: z.enum(['ar', 'en', 'mixed', 'und']),
      method: z.string(),
      sentences: z
        .array(z.object({ sentenceId: z.string(), language: z.enum(['ar', 'en', 'mixed', 'und']) }))
        .optional(),
    }),
    sentiment: z.object({
      label,
      confidence,
      sentences: z.array(z.object({ sentenceId: z.string(), label, confidence })).optional(),
    }),
    aspects: z.object({
      taxonomyVersion: z.string(),
      mentions: z.array(
        z.object({
          aspect: z.string().min(1).max(100),
          label,
          sentenceId: z.string(),
          start: z.number().int().min(0),
          end: z.number().int().min(0),
          quote: z.string().min(1),
          confidence,
        }),
      ),
    }),
    embeddings: z.object({
      vectors: z.array(
        z.object({ id: z.string(), values: z.array(z.number().finite()).min(1).max(10000) }),
      ),
    }),
    clustering: z.object({
      clusters: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          memberIds: z.array(z.string()),
          evidenceIds: z.array(z.string()),
        }),
      ),
      noiseIds: z.array(z.string()),
    }),
    forecasting: z.object({
      points: z.array(
        z.object({
          date: z.string(),
          value: z.number().finite(),
          lower: z.number().finite().optional(),
          upper: z.number().finite().optional(),
        }),
      ),
      sampleCount: z.number().int().min(1),
      uncertainty: z.string().optional(),
    }),
    report: z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      sections: z
        .array(
          z.object({
            title: z.string(),
            text: z.string(),
            evidenceIds: z.array(z.string()).min(1),
          }),
        )
        .min(1),
      evidence: z.array(citation).min(1),
    }),
    assistant: z.union([
      z
        .object({
          status: z.literal('insufficient_evidence'),
          answer: z.null(),
          evidence: z.array(citation).length(0),
        })
        .strict(),
      z
        .object({
          status: z.literal('answered').default('answered'),
          answer: z.string().min(1),
          evidence: z.array(citation).min(1),
        })
        .strict(),
    ]),
    survey_generation: z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().max(2000),
      questions: z
        .array(questionSchema)
        .min(5)
        .max(10)
        .refine(
          (questions) =>
            new Set(questions.map((question) => question.id)).size === questions.length,
        ),
    }),
  };
  const parsed = schemas[capability].safeParse(value);
  if (!parsed.success) throw new Error('invalid_model_output');
  const result = parsed.data,
    raw = Array.from(input.text || '');
  if (
    capability === 'normalization' &&
    (result.text !== input.text ||
      result.sentences.some(
        (s) => s.end <= s.start || raw.slice(s.start, s.end).join('') !== s.text,
      ))
  )
    throw new Error('invalid_model_output');
  if (capability === 'aspects') {
    const pairs = new Set();
    for (const m of result.mentions) {
      const sentence = input.sentences?.find((s) => s.id === m.sentenceId),
        key = `${m.sentenceId}:${m.aspect}`;
      if (
        !sentence ||
        pairs.has(key) ||
        m.start < sentence.start ||
        m.end > sentence.end ||
        m.end <= m.start ||
        raw.slice(m.start, m.end).join('') !== m.quote
      )
        throw new Error('invalid_model_output');
      pairs.add(key);
    }
  }
  if (['sentiment', 'language'].includes(capability) && input.sentences?.length) {
    const expected = new Set(input.sentences.map((s) => s.id)),
      actual = result.sentences || [];
    if (
      actual.length !== expected.size ||
      new Set(actual.map((s) => s.sentenceId)).size !== expected.size ||
      actual.some((s) => !expected.has(s.sentenceId))
    )
      throw new Error('invalid_model_output');
  }
  const evidence = new Map((input.evidence || []).map((e) => [e.id, e.text]));
  if (['report', 'assistant'].includes(capability)) {
    if (result.evidence.some((e) => !evidence.get(e.id)?.includes(e.quote)))
      throw new Error('invalid_model_output');
    if (
      result.sections?.some((s) =>
        s.evidenceIds.some((id) => !evidence.has(id) || !result.evidence.some((e) => e.id === id)),
      )
    )
      throw new Error('invalid_model_output');
  }
  if (
    capability === 'embeddings' &&
    (new Set(result.vectors.map((v) => v.id)).size !== result.vectors.length ||
      result.vectors.some(
        (v) => !evidence.has(v.id) || v.values.length !== result.vectors[0].values.length,
      ))
  )
    throw new Error('invalid_model_output');
  if (capability === 'clustering') {
    const members = result.clusters.flatMap((c) => c.memberIds),
      all = [...members, ...result.noiseIds];
    if (
      new Set(all).size !== all.length ||
      all.some((id) => !evidence.has(id)) ||
      result.clusters.some(
        (c) =>
          !c.memberIds.length ||
          !c.evidenceIds.length ||
          c.evidenceIds.some((id) => !c.memberIds.includes(id)),
      )
    )
      throw new Error('invalid_model_output');
  }
  if (
    capability === 'forecasting' &&
    (result.sampleCount > (input.parameters?.observations?.length || 0) ||
      result.points.some(
        (p) =>
          !input.parameters?.futureDates?.includes(p.date) ||
          p.value < 0 ||
          p.value > 10 ||
          (p.lower !== undefined && (p.lower > p.value || p.lower < 0)) ||
          (p.upper !== undefined && (p.upper < p.value || p.upper > 10)),
      ))
  )
    throw new Error('invalid_model_output');
  return result;
}
export async function executeTask(capability, input, deps) {
  if (!deps.config.aiServiceKey) return { status: 'unavailable', error: 'model_unavailable' };
  try {
    const response = await fetch(`${deps.config.aiServiceUrl}/api/v1/tasks/${capability}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Service-Key': deps.config.aiServiceKey },
      body: JSON.stringify({ schemaVersion: 1, ...input }),
      signal: AbortSignal.timeout(deps.config.aiTimeoutMs),
    });
    const body = await response.json();
    if (response.status === 503 && body.error?.code === 'model_unavailable')
      return { status: 'unavailable', error: 'model_unavailable' };
    if (
      !response.ok ||
      body.status !== 'succeeded' ||
      body.schemaVersion !== 1 ||
      body.capability !== capability ||
      !body.pipelineVersion ||
      !body.modelVersion
    )
      return {
        status: 'failed',
        error:
          body.error?.code === 'invalid_model_output'
            ? 'invalid_model_output'
            : 'service_unavailable',
      };
    if (body.testOnly === true) return { status: 'failed', error: 'test_model_not_allowed' };
    return {
      status: 'succeeded',
      result: validateResult(capability, body.result, input),
      modelVersion: body.modelVersion,
      pipelineVersion: body.pipelineVersion,
    };
  } catch (error) {
    return {
      status: 'failed',
      error:
        error.message === 'invalid_model_output' ? 'invalid_model_output' : 'service_unavailable',
    };
  }
}
