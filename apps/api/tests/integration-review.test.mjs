import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import request from 'supertest';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { hashPassword } from '../src/modules/auth/passwords.mjs';
import { digest } from '../src/modules/auth/sessions.mjs';
import { decryptPayload } from '../src/modules/mail/crypto.mjs';
import { runPendingAnalysis } from '../src/modules/analysis/service.mjs';

async function ownerAccount(deps, address = 'review-owner@example.test') {
  const http = createHttp(deps),
    id = randomUUID();
  await deps.models.User.insertOne({
    _id: id,
    name: 'Synthetic owner',
    email: address,
    locale: 'en',
    verifiedAt: deps.now(),
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
  });
  await http.mutate('post', '/auth/login', { email: address, password: 'Synthetic123' });
  await http.mutate('put', '/workspace', { businessName: 'Synthetic cafe', industry: 'Cafe' });
  await http.mutate('put', '/workspace/setup', { branchType: 'multiple', branchName: 'Cairo' });
  return { ...http, id, workspace: (await http.get('/workspace')).body };
}

test('anonymous invitation continuation survives registration verification and login without storing a raw token', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await ownerAccount(deps),
      invitee = createHttp(deps),
      address = 'new-invitee@example.test';
    const invitation = (
      await owner.mutate(
        'post',
        '/team/invitations',
        { email: address, role: 'manager', branchIds: [owner.workspace.primaryBranchId] },
        201,
      )
    ).body.invitation;
    const token = new URL(invitation.acceptUrl).hash.split('token=')[1];
    assert.equal((await invitee.get('/auth/session')).body.pendingInvitation, false);
    await invitee.agent.post('/api/v1/auth/invitation-continuation').send({ token }).expect(403);
    const stored = await invitee.mutate('post', '/auth/invitation-continuation', { token });
    assert.equal(stored.body.pendingInvitation, true);
    assert.equal(stored.text.includes(token), false);
    const anonymous = await deps.models.Session.findOne({
      userId: null,
      pendingInvitationDigest: digest(token),
    }).lean();
    assert.ok(anonymous);
    assert.equal(JSON.stringify(await deps.models.Session.find().lean()).includes(token), false);
    await invitee.mutate(
      'post',
      '/auth/register',
      { name: 'Invited user', email: address, password: 'Synthetic123', terms: true, locale: 'en' },
      201,
    );
    assert.equal((await invitee.get('/auth/session')).body.pendingInvitation, true);
    const user = await deps.models.User.findOne({ email: address }).lean();
    const message = await deps.models.MailOutbox.findOne({
      userId: user._id,
      kind: 'verify',
      status: 'pending',
    }).lean();
    const verification = decryptPayload(message.payload, deps.config.mailKey).token;
    await invitee.mutate('post', '/auth/verify-email', { token: verification });
    await invitee.mutate('post', '/auth/login', { email: address, password: 'Synthetic123' });
    const before = (await invitee.get('/auth/session')).body;
    assert.equal(before.pendingInvitation, true);
    assert.equal(before.workspace, null);
    assert.equal(before.user.emailVerified, true);
    assert.ok(
      (await deps.models.Session.findOne({ userId: user._id, revokedAt: null }).lean())
        .pendingInvitationDigest,
    );
    await invitee.mutate('post', '/team/accept', {});
    const accepted = (await invitee.get('/auth/session')).body;
    assert.equal(accepted.pendingInvitation, false);
    assert.equal(accepted.workspace.id, owner.workspace.id);
    assert.equal(accepted.workspace.role, 'manager');
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: user._id }), 0);
    await invitee.mutate('post', '/team/accept', {}, 400);
    assert.equal(JSON.stringify(await deps.models.Session.find().lean()).includes(token), false);
  } finally {
    await deps.cleanup();
  }
});

test('invitation continuation validates expiry and revocation, binds email and supports explicit cancellation', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await ownerAccount(deps),
      anonymous = createHttp(deps);
    const invitation = (
      await owner.mutate(
        'post',
        '/team/invitations',
        {
          email: 'later@example.test',
          role: 'viewer',
          branchIds: [owner.workspace.primaryBranchId],
        },
        201,
      )
    ).body.invitation;
    const token = new URL(invitation.acceptUrl).hash.split('token=')[1];
    await anonymous.mutate('post', '/auth/invitation-continuation', { token });
    await anonymous.mutate('delete', '/auth/invitation-continuation', {});
    assert.equal((await anonymous.get('/auth/session')).body.pendingInvitation, false);
    await anonymous.mutate('post', '/auth/invitation-continuation', { token });
    await deps.models.Invitation.updateOne(
      { _id: invitation.id },
      { $set: { expiresAt: new Date(0) } },
    );
    assert.equal((await anonymous.get('/auth/session')).body.pendingInvitation, false);
    await anonymous.mutate('post', '/auth/invitation-continuation', { token }, 400);
    await deps.models.Invitation.updateOne(
      { _id: invitation.id },
      { $set: { expiresAt: new Date(Date.now() + 60000), revokedAt: deps.now() } },
    );
    await anonymous.mutate('post', '/auth/invitation-continuation', { token }, 400);
    await deps.models.Invitation.updateOne({ _id: invitation.id }, { $set: { revokedAt: null } });
    await owner.mutate('post', '/auth/invitation-continuation', { token });
    await owner.mutate('post', '/team/accept', {}, 400);
    assert.equal((await deps.models.Invitation.findById(invitation.id).lean()).acceptedAt, null);
    await owner.mutate('delete', '/auth/invitation-continuation', {});
  } finally {
    await deps.cleanup();
  }
});

test('accepted 12k multi-answer responses preserve complete source text through builtin and embedding tasks', async () => {
  const deps = await createTestDatabase(),
    seen = [];
  const service = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw),
      capability = req.url.split('/').at(-1);
    seen.push({ capability, input });
    if (input.evidence.some((e) => Array.from(e.text).length > 32768)) {
      res.statusCode = 422;
      res.end('{}');
      return;
    }
    const results = {
      normalization: {
        text: input.text,
        normalizedText: input.text,
        method: 'unicode-arabic-v2',
        sentences: [{ id: 's1', start: 0, end: Array.from(input.text).length, text: input.text }],
      },
      language: {
        language: 'en',
        method: 'unicode-script-v1',
        sentences: [{ sentenceId: 's1', language: 'en' }],
      },
      embeddings: {
        vectors: [{ id: input.evidence[0].id, values: Array(384).fill(0.1234567890123456) }],
      },
    };
    res.setHeader('Content-Type', 'application/json');
    if (!results[capability]) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: { code: 'model_unavailable' } }));
      return;
    }
    res.end(
      JSON.stringify({
        schemaVersion: 1,
        status: 'succeeded',
        capability,
        modelVersion: capability === 'embeddings' ? 'embedding-model-1' : 'builtin-1',
        pipelineVersion: 'pipeline-1',
        result: results[capability],
      }),
    );
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  deps.config.aiServiceKey = 'synthetic-key';
  deps.config.aiServiceUrl = `http://127.0.0.1:${service.address().port}`;
  try {
    const owner = await ownerAccount(deps),
      questions = [0, 1].map((i) => ({
        id: randomUUID(),
        type: 'long_text',
        label: `Question ${i}`,
        required: true,
      }));
    const survey = (
      await owner.mutate(
        'post',
        '/surveys',
        { title: 'Long feedback', description: '', locale: 'en', questions },
        201,
      )
    ).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const answers = questions.map((q, index) => ({
      questionId: q.id,
      value: (index ? 'B' : 'A').repeat(6000),
    }));
    await request(owner.app)
      .post(`/api/v1/public/surveys/${published.links[0].token}/responses`)
      .send({ answers, locale: 'en', consent: true, idempotencyKey: randomUUID() })
      .expect(201);
    await runPendingAnalysis(deps);
    const response = (await owner.get('/feedback')).body.responses[0];
    assert.equal(response.text.length, 12001);
    assert.equal(response.preprocessing.text, response.text);
    assert.equal(response.language, 'en');
    const embedding = await deps.models.AnalysisJob.findOne({
      responseId: response.id,
      capability: 'embeddings',
    }).lean();
    assert.equal(embedding.status, 'succeeded');
    assert.equal(embedding.result.vectors[0].id, response.id);
    assert.equal(embedding.result.vectors[0].values.length, 384);
    assert.ok(
      seen.every(
        ({ input }) => input.text === response.text && input.evidence[0].text === response.text,
      ),
    );
  } finally {
    service.closeAllConnections();
    await new Promise((resolve) => service.close(resolve));
    await deps.cleanup();
  }
});

test('realistic 32 by 384 clustering vectors produce an executable bounded sample with explicit coverage', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await ownerAccount(deps),
      now = deps.now();
    const responses = Array.from({ length: 32 }, (_, index) => {
      const id = randomUUID();
      return {
        _id: id,
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
        text: `Slow service ${index}`,
        language: 'en',
        submittedLocale: 'en',
        consentAt: now,
        createdAt: new Date(now.getTime() + index),
        idempotencyKey: randomUUID(),
        payloadDigest: 'synthetic',
        analysisStatus: 'waiting_for_model',
        analysis: {
          embeddings: {
            modelVersion: 'embedding-model-1',
            pipelineVersion: 'pipeline-1',
            vectors: [{ id, values: Array(384).fill(0.1234567890123456) }],
          },
        },
      };
    });
    await deps.models.Response.insertMany(responses);
    await owner.mutate('post', '/analysis/retry', {});
    const job = await deps.models.AnalysisJob.findOne({ capability: 'clustering' }).lean();
    assert.ok(Buffer.byteLength(JSON.stringify(job.input.parameters), 'utf8') <= 120000);
    assert.ok(job.input.evidence.length >= 5 && job.input.evidence.length < 32);
    assert.deepEqual(
      job.input.parameters.vectors.map((v) => v.id),
      job.input.evidence.map((e) => e.id),
    );
    assert.ok(job.input.parameters.vectors.every((v) => v.values.length === 384));
    assert.equal(job.input.parameters.totalResponses, 32);
    assert.equal(job.input.parameters.sampled, true);
  } finally {
    await deps.cleanup();
  }
});

test('cluster summaries wait for a generative model, then persist grounded output and nonempty-cohort assistant abstention', async () => {
  const deps = await createTestDatabase(),
    calls = [];
  let summaryReady = false;
  const service = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      res.end(
        JSON.stringify({ schemaVersion: 1, pipelineVersion: 'pipeline-1', capabilities: [] }),
      );
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw),
      capability = req.url.split('/').at(-1);
    calls.push({ capability, input });
    let result;
    if (capability === 'clustering')
      result = {
        clusters: [
          {
            id: 'c1',
            label: 'Topic 0',
            memberIds: input.evidence.map((e) => e.id),
            evidenceIds: [input.evidence[0].id],
          },
        ],
        noiseIds: [],
      };
    if (capability === 'report' && !summaryReady) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: { code: 'model_unavailable' } }));
      return;
    }
    if (capability === 'report')
      result = {
        title: 'Slow service',
        summary: 'Customers describe slow service.',
        sections: [
          {
            title: 'Service',
            text: 'Service needs attention.',
            evidenceIds: [input.evidence[0].id],
          },
        ],
        evidence: [{ id: input.evidence[0].id, quote: input.evidence[0].text }],
      };
    if (capability === 'assistant')
      result = { status: 'insufficient_evidence', answer: null, evidence: [] };
    res.end(
      JSON.stringify({
        schemaVersion: 1,
        status: 'succeeded',
        capability,
        modelVersion: 'model-1',
        pipelineVersion: 'pipeline-1',
        result,
      }),
    );
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  deps.config.aiServiceKey = 'synthetic-key';
  deps.config.aiServiceUrl = `http://127.0.0.1:${service.address().port}`;
  try {
    const owner = await ownerAccount(deps),
      now = deps.now();
    for (let index = 0; index < 5; index++) {
      const id = randomUUID();
      await deps.models.Response.insertOne({
        _id: id,
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
        text: `Slow service on visit ${index}`,
        language: 'en',
        submittedLocale: 'en',
        consentAt: now,
        createdAt: now,
        idempotencyKey: randomUUID(),
        payloadDigest: 'synthetic',
        analysisStatus: 'waiting_for_model',
        analysis: {
          embeddings: {
            modelVersion: 'embedding-1',
            pipelineVersion: 'pipeline-1',
            vectors: [{ id, values: [0.1, 0.2] }],
          },
        },
      });
    }
    await owner.mutate('post', '/analysis/retry', {});
    await runPendingAnalysis(deps);
    let topic = (await owner.get('/analytics')).body.topics[0];
    assert.equal(topic.summaryStatus, 'queued');
    assert.equal(topic.summary, null);
    await runPendingAnalysis(deps);
    topic = (await owner.get('/analytics')).body.topics[0];
    assert.equal(topic.summaryStatus, 'waiting_for_model');
    assert.equal(topic.summary, null);
    const summaryCall = calls.find((call) => call.capability === 'report');
    assert.equal(summaryCall.input.parameters.purpose, 'cluster_summary');
    assert.equal(summaryCall.input.parameters.clusterId, 'c1');
    assert.ok(summaryCall.input.evidence.every((e) => topic.memberIds.includes(e.id)));
    summaryReady = true;
    await owner.mutate('post', '/analysis/retry', {});
    await runPendingAnalysis(deps);
    topic = (await owner.get('/analytics')).body.topics[0];
    assert.equal(topic.summaryStatus, 'succeeded');
    assert.equal(topic.summary, 'Customers describe slow service.');
    assert.equal(topic.summaryTitle, 'Slow service');
    assert.equal(topic.summaryModelVersion, 'model-1');
    assert.equal(topic.summaryEvidence.length, 1);
    const child = await deps.models.AnalysisJob.findOne({ purpose: 'cluster_summary' }).lean();
    assert.equal(child.provenance.length, 1);
    assert.ok(child.branchIds.every((id) => id === owner.workspace.primaryBranchId));
    const abstain = (
      await owner.mutate('post', '/assistant/messages', {
        message: 'What was the car registration?',
        locale: 'en',
        filters: {},
      })
    ).body;
    assert.equal(abstain.status, 'insufficient_evidence');
    assert.equal(abstain.answer, null);
    assert.deepEqual(abstain.evidence, []);
    assert.ok(calls.find((call) => call.capability === 'assistant').input.evidence.length > 0);
    const foreign = await ownerAccount(deps, 'foreign-review@example.test');
    assert.deepEqual((await foreign.get('/analytics')).body.topics, []);
  } finally {
    service.closeAllConnections();
    await new Promise((resolve) => service.close(resolve));
    await deps.cleanup();
  }
});

test('analysis pump prioritizes a newer queued builtin before a backlog of old missing-model jobs', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await ownerAccount(deps),
      old = new Date(deps.now().getTime() - 60000);
    const waiting = Array.from({ length: 12 }, () => ({
      _id: randomUUID(),
      workspaceId: owner.workspace.id,
      capability: 'report',
      status: 'waiting_for_model',
      attempts: 0,
      error: 'model_unavailable',
      createdAt: old,
      updatedAt: old,
      input: { taskId: randomUUID(), locale: 'en', evidence: [] },
    }));
    await deps.models.AnalysisJob.insertMany(waiting);
    const id = randomUUID();
    await deps.models.AnalysisJob.insertOne({
      _id: id,
      workspaceId: owner.workspace.id,
      capability: 'language',
      status: 'queued',
      attempts: 0,
      createdAt: deps.now(),
      updatedAt: deps.now(),
      input: {
        taskId: id,
        locale: 'en',
        text: 'Good food.',
        evidence: [{ id: 'source', text: 'Good food.' }],
      },
    });
    await runPendingAnalysis(deps, { limit: 2 });
    assert.equal((await deps.models.AnalysisJob.findById(id).lean()).attempts, 1);
    assert.equal(
      await deps.models.AnalysisJob.countDocuments({
        _id: { $in: waiting.map((job) => job._id) },
        attempts: 1,
      }),
      1,
    );
  } finally {
    await deps.cleanup();
  }
});
