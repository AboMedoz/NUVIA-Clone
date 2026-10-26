import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  capabilities,
  executeTask,
  validateResult,
} from '../src/integrations/ai-service/client.mjs';
import { aggregateResponses } from '../src/modules/analytics/service.mjs';

test('normalization uses Python whitespace semantics without dropping source characters', () => {
  for (const separator of ['\u0085', '\u001c', '\u001d', '\u001e', '\u001f', '\u2028']) {
    const text = `Good.${separator}Bad.${separator}`;
    const result = {
      text,
      normalizedText: text,
      method: 'synthetic',
      sentences: [
        { id: 's1', start: 0, end: 5, text: 'Good.' },
        { id: 's2', start: 6, end: 10, text: 'Bad.' },
      ],
    };
    assert.deepEqual(validateResult('normalization', result, { text }), result);
    assert.doesNotThrow(() =>
      validateResult(
        'normalization',
        { text: separator, normalizedText: '', method: 'synthetic', sentences: [] },
        { text: separator },
      ),
    );
    assert.throws(
      () => validateResult('normalization', { ...result, normalizedText: separator }, { text }),
      /invalid_model_output/,
    );
  }
  const text = 'Good.\ufeffBad.';
  assert.throws(
    () =>
      validateResult(
        'normalization',
        {
          text,
          normalizedText: text,
          method: 'synthetic',
          sentences: [
            { id: 's1', start: 0, end: 5, text: 'Good.' },
            { id: 's2', start: 6, end: 10, text: 'Bad.' },
          ],
        },
        { text },
      ),
    /invalid_model_output/,
  );
});

test('normalization rejects duplicate, overlapping and incomplete sentence spans before persistence', () => {
  const input = { text: 'Good. Slow.' };
  const valid = {
    text: input.text,
    normalizedText: input.text,
    method: 'synthetic',
    sentences: [
      { id: 's1', start: 0, end: 5, text: 'Good.' },
      { id: 's2', start: 6, end: 11, text: 'Slow.' },
    ],
  };
  assert.deepEqual(validateResult('normalization', valid, input), valid);
  for (const sentences of [
    valid.sentences.map((s) => ({ ...s, id: 's1' })),
    valid.sentences.slice(0, 1),
    [],
    [...valid.sentences].reverse(),
    [valid.sentences[0], { id: 's2', start: 4, end: 11, text: '. Slow.' }],
    [{ id: '', start: 0, end: 11, text: input.text }],
    [{ id: 's1', start: 0, end: 100, text: input.text }],
  ])
    assert.throws(
      () => validateResult('normalization', { ...valid, sentences }, input),
      /invalid_model_output/,
    );
});

test('normalization preserves nonempty source content and shares the internal sentence limit', () => {
  assert.throws(
    () =>
      validateResult(
        'normalization',
        {
          text: 'Good.',
          normalizedText: ' ',
          method: 'synthetic',
          sentences: [{ id: 's1', start: 0, end: 5, text: 'Good.' }],
        },
        { text: 'Good.' },
      ),
    /invalid_model_output/,
  );
  const text = 'a'.repeat(16385);
  assert.throws(
    () =>
      validateResult(
        'normalization',
        {
          text,
          normalizedText: text,
          method: 'synthetic',
          sentences: Array.from(text, (_, index) => ({
            id: `s${index}`,
            start: index,
            end: index + 1,
            text: 'a',
          })),
        },
        { text },
      ),
    /invalid_model_output/,
  );
});

test('text-only embedding requests use the task ID as their single source', () => {
  const input = { taskId: 'text-source', text: 'Good service.' };
  const result = { vectors: [{ id: input.taskId, values: [0.1, 0.2] }] };
  assert.deepEqual(validateResult('embeddings', result, input), result);
  assert.throws(() => validateResult('embeddings', { vectors: [] }, input), /invalid_model_output/);
});

test('dataset results must cover every source vector and requested forecast period exactly once', () => {
  const input = {
    evidence: [
      { id: 'r1', text: 'Good.' },
      { id: 'r2', text: 'Slow.' },
    ],
  };
  const vectors = [
    { id: 'r1', values: [0.1, 0.2] },
    { id: 'r2', values: [0.3, 0.4] },
  ];
  assert.equal(validateResult('embeddings', { vectors }, input).vectors.length, 2);
  for (const partial of [[], vectors.slice(0, 1)])
    assert.throws(
      () => validateResult('embeddings', { vectors: partial }, input),
      /invalid_model_output/,
    );
  const cluster = { id: 'c1', label: 'Topic 1', memberIds: ['r1'], evidenceIds: ['r1'] };
  assert.equal(
    validateResult('clustering', { clusters: [cluster], noiseIds: ['r2'] }, input).clusters.length,
    1,
  );
  for (const result of [
    { clusters: [cluster], noiseIds: [] },
    { clusters: [], noiseIds: [] },
    { clusters: [cluster, { ...cluster, memberIds: ['r2'], evidenceIds: ['r2'] }], noiseIds: [] },
  ])
    assert.throws(() => validateResult('clustering', result, input), /invalid_model_output/);
  const forecastInput = {
    parameters: {
      observations: [
        { date: '2026-10-24', value: 5 },
        { date: '2026-10-25', value: 6 },
      ],
      futureDates: ['2026-10-26', '2026-10-27'],
    },
  };
  const points = forecastInput.parameters.futureDates.map((date) => ({
    date,
    value: 5,
    lower: 4,
    upper: 6,
  }));
  assert.equal(
    validateResult('forecasting', { points, sampleCount: 2 }, forecastInput).points.length,
    2,
  );
  for (const result of [
    { points: [], sampleCount: 2 },
    { points: points.slice(0, 1), sampleCount: 2 },
    { points: [points[0], points[0]], sampleCount: 2 },
    { points: [...points].reverse(), sampleCount: 2 },
    { points, sampleCount: 1 },
    { points: points.map(({ upper: _upper, ...p }) => p), sampleCount: 2 },
  ])
    assert.throws(
      () => validateResult('forecasting', result, forecastInput),
      /invalid_model_output/,
    );
});

test('public capability metadata preserves provider readiness and locale limits without private fields', async () => {
  const entry = {
    capability: 'sentiment',
    available: true,
    status: 'ready',
    provider: 'gemini',
    readiness: 'configured_unverified_remote',
    languages: ['en'],
    modelVersion: 'gemini:model',
    pipelineVersion: 'pipeline-1',
    secret: 'must-be-stripped',
    modelPath: '/private/model',
  };
  const server = createServer((_req, res) =>
    res.end(
      JSON.stringify({ schemaVersion: 1, pipelineVersion: 'pipeline-1', capabilities: [entry] }),
    ),
  );
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const result = await capabilities({
      config: {
        aiServiceKey: 'synthetic',
        aiServiceUrl: `http://127.0.0.1:${server.address().port}`,
        aiTimeoutMs: 1000,
      },
    });
    assert.equal(result.capabilities[0].readiness, entry.readiness);
    assert.equal(result.capabilities[0].provider, 'gemini');
    assert.deepEqual(result.capabilities[0].languages, ['en']);
    assert.equal(result.capabilities[0].pipelineVersion, 'pipeline-1');
    assert.equal(result.capabilities[0].secret, undefined);
    assert.equal(result.capabilities[0].modelPath, undefined);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('oversized cloud embedding input keeps its permanent error instead of a transient retry', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'provider_input_too_large' } }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const result = await executeTask(
      'embeddings',
      { taskId: 'synthetic', locale: 'en', text: 'Synthetic input' },
      {
        config: {
          aiServiceUrl: `http://127.0.0.1:${server.address().port}`,
          aiServiceKey: 'synthetic-key',
          aiTimeoutMs: 1000,
        },
      },
    );
    assert.deepEqual(result, { status: 'failed', error: 'provider_input_too_large' });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('assistant preserves a typed insufficient-evidence abstention for a nonempty evidence cohort', () => {
  const result = validateResult(
    'assistant',
    { status: 'insufficient_evidence', answer: null, evidence: [] },
    {
      text: 'What was the car registration?',
      evidence: [{ id: 'r1', text: 'Food was good.' }],
    },
  );
  assert.deepEqual(result, { status: 'insufficient_evidence', answer: null, evidence: [] });
  assert.throws(
    () =>
      validateResult(
        'assistant',
        { status: 'answered', answer: 'A guess', evidence: [] },
        { evidence: [] },
      ),
    /invalid_model_output/,
  );
});

test('generated survey suggestions retain publishable UUIDs, bounded labels and unique question IDs', () => {
  const questions = Array.from({ length: 5 }, (_, index) => ({
    id: randomUUID(),
    type: 'long_text',
    label: `Question ${index}`,
    required: true,
  }));
  const result = { title: 'Visit survey', description: '', questions };
  assert.equal(validateResult('survey_generation', result, {}).questions.length, 5);
  assert.throws(
    () =>
      validateResult(
        'survey_generation',
        { ...result, questions: questions.map((q) => ({ ...q, id: 'q1' })) },
        {},
      ),
    /invalid_model_output/,
  );
  assert.throws(
    () => validateResult('survey_generation', { ...result, title: 'x'.repeat(121) }, {}),
    /invalid_model_output/,
  );
});

test('AI contracts reject malformed outputs, forged source spans, unsupported citations and test adapters', async () => {
  const input = {
    text: 'Good food. Slow service.',
    sentences: [{ id: 's1', start: 0, end: 10, text: 'Good food.' }],
    evidence: [{ id: 'r1', text: 'Good food.' }],
  };
  assert.throws(
    () => validateResult('sentiment', { label: 'happy' }, input),
    /invalid_model_output/,
  );
  assert.throws(
    () => validateResult('sentiment', { label: 'positive' }, input),
    /invalid_model_output/,
  );
  assert.throws(
    () =>
      validateResult(
        'aspects',
        {
          taxonomyVersion: 'v1',
          mentions: [
            {
              aspect: 'food',
              label: 'positive',
              sentenceId: 's1',
              start: 0,
              end: 4,
              quote: 'Fake',
            },
          ],
        },
        input,
      ),
    /invalid_model_output/,
  );
  assert.throws(
    () =>
      validateResult(
        'assistant',
        { answer: 'Good', evidence: [{ id: 'foreign', quote: 'Good food.' }] },
        input,
      ),
    /invalid_model_output/,
  );
  assert.throws(
    () =>
      validateResult(
        'report',
        {
          title: 'Report',
          summary: 'Good',
          sections: [{ title: 'Topic', text: 'Good', evidenceIds: ['foreign'] }],
          evidence: [],
        },
        input,
      ),
    /invalid_model_output/,
  );
  assert.throws(
    () => validateResult('embeddings', { vectors: [{ id: 'foreign', values: [0.1] }] }, input),
    /invalid_model_output/,
  );
  assert.throws(
    () => validateResult('clustering', { clusters: [], noiseIds: ['foreign'] }, input),
    /invalid_model_output/,
  );
  assert.throws(
    () =>
      validateResult(
        'forecasting',
        { points: [{ date: '2070-01-01', value: 200 }], sampleCount: 1 },
        {
          parameters: {
            futureDates: ['2026-10-26'],
            observations: [{ date: '2026-10-25', value: 5 }],
          },
        },
      ),
    /invalid_model_output/,
  );
  let testOnly = true;
  const server = createServer((_req, res) =>
    res.end(
      JSON.stringify({
        schemaVersion: 1,
        status: 'succeeded',
        capability: 'sentiment',
        modelVersion: testOnly ? 'fixture-v1' : 'latest-1',
        testOnly,
        pipelineVersion: 'v1',
        result: { label: 'positive', sentences: [{ sentenceId: 's1', label: 'positive' }] },
      }),
    ),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await executeTask(
      'sentiment',
      { taskId: 'synthetic', locale: 'en', ...input },
      {
        config: {
          aiServiceUrl: `http://127.0.0.1:${server.address().port}`,
          aiServiceKey: 'synthetic-key',
          aiTimeoutMs: 1000,
        },
      },
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'test_model_not_allowed');
    testOnly = false;
    const accepted = await executeTask(
      'sentiment',
      { taskId: 'synthetic', locale: 'en', ...input },
      {
        config: {
          aiServiceUrl: `http://127.0.0.1:${server.address().port}`,
          aiServiceKey: 'synthetic-key',
          aiTimeoutMs: 1000,
        },
      },
    );
    assert.equal(accepted.status, 'succeeded');
    assert.equal(accepted.modelVersion, 'latest-1');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('analytics computes real four-class counts, sentence-aspect scores and timezone periods without invented outputs', () => {
  const responses = [
    {
      branchId: 'b1',
      branchName: 'Cairo',
      createdAt: new Date('2026-10-24T22:30:00Z'),
      analysisStatus: 'succeeded',
      segments: { service: 'Delivery' },
      analysis: {
        sentiment: { label: 'mixed' },
        aspects: {
          mentions: [
            { aspect: 'food', label: 'positive' },
            { aspect: 'speed', label: 'negative' },
          ],
        },
      },
    },
    {
      branchId: 'b1',
      branchName: 'Cairo',
      createdAt: new Date('2026-10-25T00:00:00Z'),
      analysisStatus: 'waiting_for_model',
      analysis: null,
    },
  ];
  const result = aggregateResponses(responses, 'Africa/Cairo', 'day');
  assert.deepEqual(result.sentimentDistribution, { mixed: 1 });
  assert.equal(result.aspectScores.find((a) => a.aspect === 'food').score, 10);
  assert.equal(result.aspectScores.find((a) => a.aspect === 'speed').score, 0);
  assert.ok(result.aspectScores.every((a) => a.lowSample));
  assert.equal(result.trends.length, 1);
  assert.equal(result.trends[0].date, '2026-10-25');
  assert.equal(result.pendingResponses, 1);
  assert.deepEqual(result.topics, []);
});
