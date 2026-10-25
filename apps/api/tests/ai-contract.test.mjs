import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { executeTask, validateResult } from '../src/integrations/ai-service/client.mjs';
import { aggregateResponses } from '../src/modules/analytics/service.mjs';

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
