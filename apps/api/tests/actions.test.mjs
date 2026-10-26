import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { actionInput, actionScope } from '../src/modules/actions/routes.mjs';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { hashPassword } from '../src/modules/auth/passwords.mjs';

async function login(deps, email, setup = false) {
  const id = randomUUID(),
    http = createHttp(deps),
    now = deps.now();
  await deps.models.User.insertOne({
    _id: id,
    name: 'Action test owner',
    email,
    locale: 'en',
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    verifiedAt: now,
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await http.mutate('post', '/auth/login', { email, password: 'Synthetic123' });
  if (setup) {
    await http.mutate('put', '/workspace', {
      businessName: 'Action test business',
      industry: 'Cafe',
    });
    await http.mutate('put', '/workspace/setup', {
      branchType: 'multiple',
      branchName: 'Action branch',
    });
  }
  return { ...http, id, workspace: setup ? (await http.get('/workspace')).body : null };
}

test('action validation rejects invalid calendar dates, duplicate evidence and empty branch scope', () => {
  const branch = randomUUID(),
    id = randomUUID();
  assert.equal(
    actionInput.safeParse({ title: 'Action', branchIds: [branch], due: '2026-02-30' }).success,
    false,
  );
  assert.equal(
    actionInput.safeParse({ title: 'Action', branchIds: [branch], responseIds: [id, id] }).success,
    false,
  );
  assert.equal(actionInput.safeParse({ title: 'Action', branchIds: [] }).success, false);
  assert.deepEqual(actionScope({ workspace: { _id: 'workspace' }, branchIds: ['allowed'] }), {
    workspaceId: 'workspace',
    branchIds: { $not: { $elemMatch: { $nin: ['allowed'] } } },
  });
});

test('actions persist edits, reject stale writes and protect evidence across owners and branches', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await login(deps, 'action-owner@example.test', true),
      stranger = await login(deps, 'action-stranger@example.test', true);
    const questionId = randomUUID();
    const survey = (
      await owner.mutate(
        'post',
        '/surveys',
        {
          title: 'Action survey',
          locale: 'en',
          questions: [
            { id: questionId, type: 'long_text', label: 'Your experience', required: true },
          ],
        },
        201,
      )
    ).body.survey;
    const published = (
      await owner.mutate('post', '/surveys/' + survey.id + '/publish', {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    await owner.agent
      .post('/api/v1/public/surveys/' + published.links[0].token + '/responses')
      .send({
        answers: [{ questionId, value: 'Literal saved action evidence' }],
        locale: 'en',
        consent: true,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const response = (await owner.get('/feedback')).body.responses[0];
    const action = (
      await owner.mutate(
        'post',
        '/actions',
        {
          title: 'Improve service',
          branchIds: [owner.workspace.primaryBranchId],
          responseIds: [response.id],
          owner: 'Branch lead',
          due: '2026-11-01',
        },
        201,
      )
    ).body.action;
    assert.equal(action.status, 'todo');
    const updated = (
      await owner.mutate('patch', '/actions/' + action.id, {
        status: 'progress',
        owner: 'Saved lead',
        version: action.version,
      })
    ).body.action;
    assert.equal(updated.owner, 'Saved lead');
    assert.equal(updated.version, 2);
    await owner.mutate(
      'patch',
      '/actions/' + action.id,
      { status: 'done', version: action.version },
      409,
    );
    assert.equal(
      (await owner.get('/actions/' + action.id + '/evidence')).body.responses[0].text,
      'Literal saved action evidence',
    );
    await stranger.get('/actions/' + action.id, 404);
    await stranger.get('/actions/' + action.id + '/evidence', 404);
    await stranger.mutate(
      'post',
      '/actions',
      {
        title: 'Forbidden evidence',
        branchIds: [stranger.workspace.primaryBranchId],
        responseIds: [response.id],
      },
      404,
    );
    const viewer = await login(deps, 'action-viewer@example.test');
    await deps.models.Membership.insertOne({
      _id: randomUUID(),
      workspaceId: owner.workspace.id,
      userId: viewer.id,
      role: 'viewer',
      branchIds: [owner.workspace.primaryBranchId],
      revokedAt: null,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    assert.equal((await viewer.get('/actions')).body.actions.length, 1);
    await viewer.mutate(
      'patch',
      '/actions/' + action.id,
      { status: 'done', version: updated.version },
      403,
    );
    await deps.models.Membership.updateOne({ userId: viewer.id }, { $set: { branchIds: [] } });
    assert.equal((await viewer.get('/actions')).body.actions.length, 0);
    await viewer.get('/actions/' + action.id + '/evidence', 404);
    await owner.mutate('delete', '/actions/' + action.id, { version: updated.version }, 204);
    assert.equal((await owner.get('/actions')).body.actions.length, 0);
  } finally {
    await deps.cleanup();
  }
});
