import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { hashPassword } from '../src/modules/auth/passwords.mjs';
async function account(deps, address, setup = true) {
  const id = randomUUID(),
    http = createHttp(deps),
    now = deps.now();
  await deps.models.User.insertOne({
    _id: id,
    name: 'Search test owner',
    email: address,
    locale: 'en',
    verifiedAt: now,
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await http.mutate('post', '/auth/login', { email: address, password: 'Synthetic123' });
  if (setup) {
    await http.mutate('put', '/workspace', { businessName: 'Search business', industry: 'Cafe' });
    await http.mutate('put', '/workspace/setup', {
      branchType: 'multiple',
      branchName: 'Search Main',
    });
  }
  return { ...http, id, workspace: setup ? (await http.get('/workspace')).body : null };
}
async function seedSurvey(owner, branchId, label) {
  const questionId = randomUUID();
  const survey = (
    await owner.mutate(
      'post',
      '/surveys',
      {
        title: 'Needle survey ' + label,
        description: 'Saved description',
        locale: 'en',
        questions: [
          { id: questionId, type: 'long_text', label: 'Your experience?', required: true },
        ],
      },
      201,
    )
  ).body.survey;
  const published = (
    await owner.mutate('post', `/surveys/${survey.id}/publish`, { branchIds: [branchId] })
  ).body.survey;
  const link = published.links.find((link) => link.enabled);
  const response = (
    await request(owner.app)
      .post('/api/v1/public/surveys/' + link.token + '/responses')
      .send({
        answers: [{ questionId, value: 'Needle feedback ' + label }],
        locale: 'en',
        consent: true,
        idempotencyKey: randomUUID(),
      })
      .expect(201)
  ).body.response;
  return { survey, response };
}
async function seedReport(owner, deps, branchId, title) {
  const report = (
    await owner.mutate(
      'post',
      '/reports',
      { locale: 'en', filters: branchId ? { branchId } : {} },
      201,
    )
  ).body.report;
  await deps.models.Report.updateOne({ _id: report.id }, { $set: { content: { title } } });
  return report;
}
test('workspace search returns saved UUIDs while isolating owners, assigned branches and empty scopes', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'search-owner@example.test'),
      stranger = await account(deps, 'search-other@example.test');
    const hidden = (
      await owner.mutate(
        'post',
        `/workspaces/${owner.workspace.id}/branches`,
        { name: 'Search Hidden' },
        201,
      )
    ).body;
    const visible = await seedSurvey(owner, owner.workspace.primaryBranchId, 'assigned'),
      restricted = await seedSurvey(owner, hidden.id, 'hidden'),
      foreign = await seedSurvey(stranger, stranger.workspace.primaryBranchId, 'other-tenant');
    const allowedReport = await seedReport(
        owner,
        deps,
        owner.workspace.primaryBranchId,
        'Needle report assigned',
      ),
      crossReport = await seedReport(owner, deps, null, 'Needle report combined');
    const ownerDraft = (
      await owner.mutate(
        'post',
        '/surveys',
        {
          title: 'Needle owner-only draft',
          description: '',
          locale: 'en',
          questions: [{ id: randomUUID(), type: 'long_text', label: 'Draft?', required: false }],
        },
        201,
      )
    ).body.survey;
    const all = (await owner.get('/search?q=Needle')).body.results;
    assert.ok(all.some((result) => result.path === '#/feedback-details?id=' + visible.response.id));
    assert.ok(all.some((result) => result.path === '#/survey-edit?id=' + visible.survey.id));
    assert.ok(all.some((result) => result.path === '#/report-details?id=' + allowedReport.id));
    assert.ok(all.some((result) => result.id === ownerDraft.id));
    assert.equal(
      all.some((result) => [foreign.response.id, foreign.survey.id].includes(result.id)),
      false,
    );
    const scoped = (await owner.get('/search?q=Needle&branchId=' + owner.workspace.primaryBranchId))
      .body.results;
    assert.equal(
      scoped.some(
        (result) => result.id === restricted.response.id || result.id === restricted.survey.id,
      ),
      false,
    );
    const manager = await account(deps, 'search-manager@example.test', false);
    const member = await deps.models.Membership.insertOne({
      _id: randomUUID(),
      workspaceId: owner.workspace.id,
      userId: manager.id,
      role: 'manager',
      branchIds: [owner.workspace.primaryBranchId],
      revokedAt: null,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    const assigned = (await manager.get('/search?q=Needle')).body.results;
    assert.ok(assigned.some((result) => result.id === visible.response.id));
    assert.ok(assigned.some((result) => result.id === allowedReport.id));
    assert.equal(
      assigned.some((result) =>
        [restricted.response.id, restricted.survey.id, crossReport.id, ownerDraft.id].includes(
          result.id,
        ),
      ),
      false,
    );
    await manager.get('/search?q=Needle&branchId=' + hidden.id, 404);
    await deps.models.Membership.updateOne({ _id: member._id }, { $set: { branchIds: [] } });
    assert.deepEqual((await manager.get('/search?q=Needle')).body.results, []);
    assert.deepEqual((await owner.get('/search?q=')).body.results, []);
    assert.deepEqual((await owner.get('/search?q=' + encodeURIComponent('.*'))).body.results, []);
    await owner.get('/search?q=' + 'a'.repeat(201), 422);
    await createHttp(deps).get('/search?q=Needle', 401);
  } finally {
    await deps.cleanup();
  }
});
