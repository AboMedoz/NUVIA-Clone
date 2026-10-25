import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { hashPassword } from '../src/modules/auth/passwords.mjs';
import { createServer } from 'node:http';

async function account(deps, email, setup = true) {
  const http = createHttp(deps),
    id = randomUUID();
  await deps.models.User.insertOne({
    _id: id,
    name: 'Synthetic owner',
    email,
    locale: 'en',
    verifiedAt: deps.now(),
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
  });
  await http.mutate('post', '/auth/login', { email, password: 'Synthetic123' });
  if (setup) {
    await http.mutate('put', '/workspace', { businessName: 'Synthetic cafe', industry: 'Cafe' });
    await http.mutate('put', '/workspace/setup', { branchType: 'multiple', branchName: 'Cairo' });
  }
  return { ...http, id, workspace: setup ? (await http.get('/workspace')).body : null };
}
const draft = () => ({
  title: 'Visit feedback',
  description: '',
  locale: 'en',
  questions: [
    { id: randomUUID(), type: 'long_text', label: 'Your experience?', required: true },
    {
      id: randomUUID(),
      type: 'single_choice',
      label: 'Service',
      required: true,
      options: ['Dine in', 'Delivery'],
      segment: true,
    },
    { id: randomUUID(), type: 'rating', label: 'Rating', required: false },
  ],
});

test('product collection preserves revisions, validates public answers, deduplicates and isolates real data', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'collection@example.test');
    const foreign = await account(deps, 'foreign@example.test');
    const input = draft();
    const survey = (await owner.mutate('post', '/surveys', input, 201)).body.survey;
    await foreign.get(`/surveys/${survey.id}`, 404);
    await owner.mutate(
      'post',
      `/surveys/${survey.id}/publish`,
      { branchIds: [foreign.workspace.primaryBranchId] },
      404,
    );
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const token = published.links[0].token;
    const publicGet = await request(owner.app).get(`/api/v1/public/surveys/${token}`).expect(200);
    assert.equal(publicGet.body.survey.title, input.title);
    assert.equal(publicGet.body.survey.workspaceId, undefined);
    const payload = {
      answers: [
        { questionId: input.questions[0].id, value: 'Food was good. Service was slow.' },
        { questionId: input.questions[1].id, value: 'Delivery' },
      ],
      locale: 'en',
      consent: true,
      idempotencyKey: randomUUID(),
    };
    const submit = (body) =>
      request(owner.app).post(`/api/v1/public/surveys/${token}/responses`).send(body);
    await submit({ ...payload, answers: [] }).expect(422);
    await submit({
      ...payload,
      answers: [...payload.answers, { questionId: randomUUID(), value: 'forged' }],
    }).expect(422);
    const submitted = await Promise.all([submit(payload), submit(payload)]);
    assert.ok(submitted.every((r) => [200, 201].includes(r.status)));
    assert.equal(submitted[0].body.response.id, submitted[1].body.response.id);
    const feedback = (
      await owner.get(
        '/feedback?segment=' +
          encodeURIComponent(JSON.stringify({ [input.questions[1].id]: 'Delivery' })),
      )
    ).body;
    assert.equal(feedback.total, 1);
    assert.equal(feedback.responses[0].analysis, null);
    assert.equal((await foreign.get('/feedback')).body.total, 0);
    await foreign.get(`/feedback/${feedback.responses[0].id}`, 404);
    const changed = (
      await owner.mutate('patch', `/surveys/${survey.id}`, {
        ...input,
        title: 'Updated survey',
        revision: published.revision,
      })
    ).body.survey;
    assert.equal(changed.revision, published.revision + 1);
    await owner.mutate(
      'patch',
      `/surveys/${survey.id}`,
      { title: 'Stale change', revision: published.revision },
      409,
    );
    assert.equal(
      (await request(owner.app).get(`/api/v1/public/surveys/${token}`)).body.survey.title,
      input.title,
    );
    assert.equal((await owner.get('/feedback')).body.responses[0].surveyTitle, input.title);
    const analytics = (await owner.get('/analytics')).body;
    assert.equal(analytics.totalResponses, 1);
    assert.equal(analytics.analyzedResponses, 0);
    assert.deepEqual(analytics.aspectScores, []);
    assert.deepEqual(analytics.sentimentDistribution, {});
    const jobs = (await owner.get('/analysis/jobs')).body.jobs;
    assert.ok(jobs.some((j) => j.status === 'waiting_for_model'));
    await owner.mutate('post', '/analysis/retry', {});
    assert.equal((await owner.get('/feedback')).body.responses[0].analysis, null);
    const csv = await owner.get('/feedback/export');
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.text, /Food was good/);
    const report = (await owner.mutate('post', '/reports', { locale: 'ar', filters: {} }, 201)).body
      .report;
    assert.equal(report.status, 'waiting_for_model');
    assert.equal(report.evidence.length, 1);
    assert.equal(report.snapshot.totalMatched, 1);
    assert.equal(report.snapshot.truncated, false);
    await foreign.get(`/reports/${report.id}`, 404);
    const pdf = await owner.get(`/reports/${report.id}/export`);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.equal(
      (
        await owner.mutate('post', '/assistant/messages', {
          message: 'What should improve?',
          locale: 'en',
          filters: {},
        })
      ).body.status,
      'model_unavailable',
    );
    await owner.mutate('post', `/surveys/${survey.id}/close`, {});
    await submit({ ...payload, idempotencyKey: randomUUID() }).expect(404);
    await owner.mutate('put', '/business-page', {
      slug: 'synthetic-cafe',
      enabled: true,
      description: 'Our feedback',
      logoUrl: '',
      contactUrl: '',
    });
    const page = (
      await request(owner.app).get('/api/v1/public/business/synthetic-cafe').expect(200)
    ).body;
    assert.equal(page.surveys.length, 0);
  } finally {
    await deps.cleanup();
  }
});

test('team access scopes branches, disallows viewer writes and immediately revokes evidence access', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'teamowner@example.test');
    const member = await account(deps, 'viewer@example.test', false);
    const otherBranch = (
      await owner.mutate(
        'post',
        `/workspaces/${owner.workspace.id}/branches`,
        { name: 'Giza' },
        201,
      )
    ).body;
    const invitation = (
      await owner.mutate(
        'post',
        '/team/invitations',
        { email: 'viewer@example.test', role: 'viewer', branchIds: [otherBranch.id] },
        201,
      )
    ).body.invitation;
    assert.ok(invitation.acceptUrl);
    assert.equal(await deps.models.MailOutbox.countDocuments({ kind: 'invitation' }), 1);
    const token = new URL(invitation.acceptUrl).hash.split('token=')[1];
    await member.mutate('post', '/team/accept', { token });
    const session = (await member.get('/auth/session')).body;
    assert.equal(session.workspace.id, owner.workspace.id);
    assert.deepEqual(
      session.workspace.branches.map((b) => b.id),
      [otherBranch.id],
    );
    await member.get('/analytics?branchId=' + owner.workspace.primaryBranchId, 404);
    await member.mutate('post', '/surveys', draft(), 403);
    const team = (await owner.get('/team')).body;
    const membership = team.members.find((m) => m.userId === member.id);
    await owner.mutate('delete', `/team/members/${membership.id}`, {}, 204);
    await member.get('/feedback', 404);
    await member.get('/reports', 404);
  } finally {
    await deps.cleanup();
  }
});

test('analysis worker processes real builtins, persists provenance, rejects invalid inference and retries safely', async () => {
  const deps = await createTestDatabase();
  let invalid = true;
  let taskCalls = 0;
  const service = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.end(
        JSON.stringify({ schemaVersion: 1, pipelineVersion: 'pipeline-v1', capabilities: [] }),
      );
      return;
    }
    taskCalls++;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw),
      capability = req.url.split('/').at(-1);
    const outputs = {
      normalization: {
        text: input.text,
        normalizedText: input.text,
        sentences: [{ id: 's1', start: 0, end: Array.from(input.text).length, text: input.text }],
        method: 'unicode-nfc-v1',
      },
      language: {
        language: 'en',
        method: 'unicode-script-v1',
        sentences: [{ sentenceId: 's1', language: 'en' }],
      },
      sentiment: {
        label: invalid ? 'fabricated-label' : 'positive',
        sentences: [{ sentenceId: 's1', label: 'positive' }],
      },
      aspects: {
        taxonomyVersion: 'v1',
        mentions: [
          {
            aspect: 'service',
            label: 'positive',
            sentenceId: 's1',
            start: 0,
            end: 4,
            quote: 'Good',
          },
        ],
      },
      embeddings: { vectors: [{ id: input.evidence?.[0].id, values: [0.1, 0.2] }] },
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        schemaVersion: 1,
        status: 'succeeded',
        capability,
        modelVersion:
          capability === 'normalization' || capability === 'language' ? 'builtin-1' : 'model-v1',
        pipelineVersion: 'pipeline-v1',
        result: outputs[capability],
      }),
    );
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  deps.config.aiServiceUrl = `http://127.0.0.1:${service.address().port}`;
  deps.config.aiServiceKey = 'synthetic-internal-key';
  try {
    const owner = await account(deps, 'analysis@example.test'),
      input = draft();
    const survey = (await owner.mutate('post', '/surveys', input, 201)).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    await request(owner.app)
      .post(`/api/v1/public/surveys/${published.links[0].token}/responses`)
      .send({
        answers: [
          { questionId: input.questions[0].id, value: 'Good service.' },
          { questionId: input.questions[1].id, value: 'Delivery' },
        ],
        locale: 'en',
        consent: true,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const worker = await import('../src/modules/analysis/service.mjs');
    assert.equal(typeof worker.runPendingAnalysis, 'function');
    await worker.runPendingAnalysis(deps);
    const first = (await owner.get('/feedback')).body.responses[0];
    assert.equal(first.language, 'en');
    assert.equal(first.analysis?.sentiment, undefined);
    assert.equal(
      (
        await deps.models.AnalysisJob.findOne({
          responseId: first.id,
          capability: 'sentiment',
        }).lean()
      ).error,
      'invalid_model_output',
    );
    invalid = false;
    const beforeRetry = taskCalls;
    await owner.mutate('post', '/analysis/retry', { responseId: first.id });
    assert.equal(
      taskCalls,
      beforeRetry,
      'Retry HTTP request schedules work without waiting for inference',
    );
    await worker.runPendingAnalysis(deps);
    const final = (await owner.get('/feedback')).body.responses[0];
    assert.equal(final.analysisStatus, 'succeeded');
    assert.equal(final.analysis.sentiment.label, 'positive');
    assert.equal(final.analysis.aspects.mentions[0].quote, 'Good');
    const job = await deps.models.AnalysisJob.findOne({
      responseId: final.id,
      capability: 'sentiment',
    }).lean();
    assert.equal(job.attempts, 2);
    assert.equal(job.provenance.length, 1);
    assert.equal(job.provenance[0].modelVersion, 'model-v1');
    const counts = (await owner.get('/analytics')).body;
    assert.equal(counts.analyzedResponses, 1);
    assert.deepEqual(counts.sentimentDistribution, { positive: 1 });
    assert.equal(counts.capabilityStates.clustering.status, 'insufficient_evidence');
    const templates = (await owner.get('/survey-templates')).body.templates;
    assert.deepEqual([...new Set(templates.map((t) => t.sector))].sort(), [
      'restaurants',
      'retail',
      'services',
    ]);
  } finally {
    service.closeAllConnections();
    await new Promise((resolve) => service.close(resolve));
    await deps.cleanup();
  }
});

test('archiving a branch disables public distribution and restoring the branch requires a new publish', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'archive@example.test');
    const branch = (
      await owner.mutate(
        'post',
        `/workspaces/${owner.workspace.id}/branches`,
        { name: 'Giza' },
        201,
      )
    ).body;
    const survey = (await owner.mutate('post', '/surveys', draft(), 201)).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, { branchIds: [branch.id] })
    ).body.survey;
    const url = `/api/v1/public/surveys/${published.links[0].token}`;
    await request(owner.app).get(url).expect(200);
    await owner.mutate('patch', `/workspaces/${owner.workspace.id}/branches/${branch.id}`, {
      archived: true,
    });
    await request(owner.app).get(url).expect(404);
    await owner.mutate('patch', `/workspaces/${owner.workspace.id}/branches/${branch.id}`, {
      archived: false,
    });
    await request(owner.app).get(url).expect(404);
  } finally {
    await deps.cleanup();
  }
});

test('dataset jobs persist authorized cluster evidence and never reuse another filtered scope', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'dataset@example.test'),
      now = deps.now();
    for (let i = 0; i < 5; i++)
      await deps.models.Response.insertOne({
        _id: randomUUID(),
        workspaceId: owner.workspace.id,
        branchId: owner.workspace.primaryBranchId,
        branchName: 'Cairo',
        surveyId: randomUUID(),
        linkId: randomUUID(),
        surveyTitle: 'Synthetic',
        revision: 1,
        answers: [],
        questions: [],
        segments: {},
        text: `Slow service ${i}`,
        language: 'en',
        submittedLocale: 'en',
        consentAt: now,
        createdAt: now,
        idempotencyKey: randomUUID(),
        payloadDigest: 'synthetic',
        analysisStatus: 'waiting_for_model',
        analysis: null,
      });
    await owner.mutate('post', '/analysis/retry', {});
    const job = await deps.models.AnalysisJob.findOne({ capability: 'clustering' }).lean();
    assert.ok(job, 'Eligible datasets must produce an executable persisted clustering job');
    assert.equal(job.input.evidence.length, 5);
    assert.ok(Array.isArray(job.input.parameters.vectors));
    await deps.models.AnalysisJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'succeeded',
          modelVersion: 'model-v1',
          pipelineVersion: 'v1',
          result: {
            clusters: [
              {
                id: 'slow-service',
                label: 'Slow service',
                memberIds: job.input.evidence.map((e) => e.id),
                evidenceIds: [job.input.evidence[0].id],
              },
            ],
            noiseIds: [],
          },
        },
      },
    );
    const result = (await owner.get('/analytics')).body;
    assert.equal(result.topics.length, 1);
    assert.equal(result.topics[0].count, 5);
    assert.equal((await owner.get('/analytics?search=unmatched')).body.topics.length, 0);
    assert.equal((await owner.get('/analytics?search=Slow')).body.topics.length, 1);
  } finally {
    await deps.cleanup();
  }
});
