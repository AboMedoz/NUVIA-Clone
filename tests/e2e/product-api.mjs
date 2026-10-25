import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createTestDatabase } from '../../apps/api/tests/helpers/database.mjs';
import { createHttp } from '../../apps/api/tests/helpers/http.mjs';
import { hashPassword } from '../../apps/api/src/modules/auth/passwords.mjs';

// Local acceptance requires an explicit binary. CI can reuse/download its isolated cache.
const binary = process.env.MONGOMS_SYSTEM_BINARY;
assert.ok(
  (binary && existsSync(binary)) || process.env.CI === 'true',
  'Set MONGOMS_SYSTEM_BINARY to an installed mongod',
);
let replica, deps, server;
try {
  replica = await MongoMemoryReplSet.create({
    binary: { ...(binary ? { systemBinary: binary } : {}), version: '7.0.24' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_TEST_URI = replica.getUri();
  deps = await createTestDatabase();
  const http = createHttp(deps);
  const email = `acceptance-${randomUUID()}@example.test`;
  await deps.models.User.insertOne({
    _id: randomUUID(),
    name: 'Synthetic acceptance owner',
    email,
    locale: 'en',
    verifiedAt: deps.now(),
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
  });
  await http.mutate('post', '/auth/login', { email, password: 'Synthetic123' });
  await http.mutate('put', '/workspace', { businessName: 'Acceptance Cafe', industry: 'Cafe' });
  await http.mutate('put', '/workspace/setup', { branchType: 'multiple', branchName: 'Cairo' });
  const workspace = (await http.get('/workspace')).body;
  const questionId = randomUUID();
  const created = await http.mutate(
    'post',
    '/surveys',
    {
      title: 'Visit feedback',
      description: 'Synthetic integration survey',
      locale: 'en',
      questions: [
        { id: questionId, type: 'long_text', label: 'Tell us about your visit', required: true },
      ],
    },
    201,
  );
  const survey = created.body.survey;
  assert.ok(survey?.id, 'Created survey has a persisted ID');
  const published = (
    await http.mutate('post', `/surveys/${survey.id}/publish`, {
      branchIds: [workspace.primaryBranchId],
    })
  ).body.survey;
  assert.equal(published.status, 'published');
  const token = published.links[0].token;
  assert.ok(token);
  server = http.app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
  const publicSurvey = await fetch(`${origin}/public/surveys/${token}`);
  assert.equal(publicSurvey.status, 200);
  const safePublic = await publicSurvey.json();
  assert.equal(safePublic.branch.id, workspace.primaryBranchId);
  assert.equal(safePublic.business.name, 'Acceptance Cafe');
  assert.equal(
    JSON.stringify(safePublic).includes(email),
    false,
    'Public form must not expose owner email',
  );
  const body = {
    answers: [{ questionId, value: 'الخدمة ممتازة لكن الانتظار طويل' }],
    locale: 'ar',
    idempotencyKey: randomUUID(),
    consent: true,
  };
  const submit = () =>
    fetch(`${origin}/public/surveys/${token}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const submitted = await submit();
  assert.equal(submitted.status, 201);
  const duplicate = await submit();
  assert.ok([200, 201].includes(duplicate.status));
  const feedback = (await http.get('/feedback')).body;
  assert.equal(feedback.total, 1, 'Idempotent retry must not duplicate feedback');
  assert.equal(feedback.responses[0].branchId, workspace.primaryBranchId);
  assert.equal(feedback.responses[0].text, body.answers[0].value);
  assert.equal(
    feedback.responses[0].analysis ?? null,
    null,
    'Missing model produces no synthetic analysis',
  );
  const analytics = (await http.get('/analytics')).body;
  assert.equal(analytics.totalResponses, 1);
  assert.equal(analytics.analyzedResponses, 0);
  assert.equal(analytics.pendingResponses, 1);
  assert.equal(analytics.aspectScores.length, 0, 'Missing evidence has no score');
  const csv = await http.agent.get('/api/v1/feedback/export').expect(200);
  assert.ok(csv.headers['content-type'].includes('text/csv'));
  assert.ok(csv.text.includes(body.answers[0].value));
  const jobs = (await http.get('/analysis/jobs')).body.jobs;
  assert.ok(jobs.some((job) => job.status === 'waiting_for_model'));
  const report = (await http.mutate('post', '/reports', { locale: 'ar', filters: {} }, 201)).body
    .report;
  assert.equal(report.status, 'waiting_for_model');
  assert.equal(report.metrics.totalResponses, 1);
  assert.equal(report.evidence[0].text, body.answers[0].value);
  const pdf = await http.agent.get(`/api/v1/reports/${report.id}/export`).expect(200);
  assert.ok(pdf.headers['content-type'].includes('application/pdf'));
  assert.ok(Buffer.isBuffer(pdf.body));
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  await mkdir(resolve('test-results/product'), { recursive: true });
  await writeFile(resolve('test-results/product/report-ar.pdf'), pdf.body);
  await http.mutate('post', `/surveys/${survey.id}/close`);
  const closed = await submit();
  assert.ok([404, 409, 410].includes(closed.status), 'Closed link rejects new requests');
  const persisted = (await http.get('/feedback')).body;
  assert.equal(persisted.total, 1, 'Closing a survey preserves earlier evidence');
  console.log(
    'Product collection, public privacy, branch binding, idempotency, persistence, real counts, CSV and missing-model integration: PASS',
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await deps?.cleanup();
  await replica?.stop();
}
