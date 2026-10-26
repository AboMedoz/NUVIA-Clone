import { workspaceBoundPath } from '../src/modules/workspaces/request-context.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { hashPassword } from '../src/modules/auth/passwords.mjs';
import {
  migrateWorkspaceIndex,
  workspaceMigrationPlan,
} from '../scripts/migrate-multi-workspace.mjs';

async function account(deps, email, setup = true) {
  const http = createHttp(deps),
    id = randomUUID(),
    now = deps.now();
  await deps.models.User.insertOne({
    _id: id,
    name: 'Multi workspace owner',
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
    await http.mutate('put', '/workspace', { businessName: 'First business', industry: 'Cafe' });
    await http.mutate('put', '/workspace/setup', {
      branchType: 'multiple',
      branchName: 'First branch',
    });
  }
  return { ...http, id, workspace: setup ? (await http.get('/workspace')).body : null };
}

test('multi workspace creation serializes concurrent first saves even with a frozen clock', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'frozen-multi@example.test', false);
    const frozen = deps.now();
    deps.now = () => frozen;
    const results = await Promise.all(
      ['First save', 'Second save'].map((businessName) =>
        owner.mutate('put', '/workspace', { businessName, industry: 'Cafe' }),
      ),
    );
    assert.equal(results[0].body.id, results[1].body.id);
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: owner.id }), 1);
    assert.equal((await deps.models.User.findById(owner.id).lean()).workspaceVersion, 2);
    await owner.mutate('put', '/workspace/setup', {
      branchType: 'multiple',
      branchName: 'Original primary',
    });
    const additional = await Promise.all(
      ['Separate A', 'Separate B'].map((businessName) =>
        owner.mutate('post', '/workspaces', { businessName, industry: 'Cafe' }, 201),
      ),
    );
    assert.notEqual(additional[0].body.workspace.id, additional[1].body.workspace.id);
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: owner.id }), 3);
    assert.equal(await deps.models.Branch.countDocuments({}), 3);
    const active = (await owner.get('/auth/session')).body.workspace.id;
    assert.ok(additional.some((response) => response.body.workspace.id === active));
  } finally {
    await deps.cleanup();
  }
});

test('multi workspace invitations add another authorized business without replacing an existing owner business', async () => {
  const deps = await createTestDatabase();
  try {
    const inviter = await account(deps, 'multi-inviter@example.test'),
      invitee = await account(deps, 'multi-invitee@example.test');
    const invitation = (
      await inviter.mutate(
        'post',
        '/team/invitations',
        {
          email: 'multi-invitee@example.test',
          role: 'manager',
          branchIds: [inviter.workspace.primaryBranchId],
        },
        201,
      )
    ).body;
    const token = new URLSearchParams(invitation.invitation.acceptUrl.split('?')[1]).get('token');
    await invitee.mutate('post', '/team/accept', { token });
    const selected = (await invitee.get('/auth/session')).body.workspace;
    assert.equal(selected.id, inviter.workspace.id);
    assert.equal(selected.role, 'manager');
    assert.equal((await invitee.get('/workspaces')).body.workspaces.length, 2);
    await invitee.mutate('post', '/workspaces/' + invitee.workspace.id + '/select');
    assert.equal((await invitee.get('/workspace')).body.role, 'owner');
    assert.equal(
      (await deps.models.Workspace.findById(invitee.workspace.id).lean()).ownerUserId,
      invitee.id,
    );
    await invitee.mutate('post', '/team/accept', { token }, 400);
  } finally {
    await deps.cleanup();
  }
});

test('multi workspace selection persists per session and mutations never overwrite another business', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'multi-owner@example.test'),
      foreign = await account(deps, 'multi-foreign@example.test');
    const first = owner.workspace;
    const second = (
      await owner.mutate(
        'post',
        '/workspaces',
        { businessName: 'Second business', industry: 'Restaurant' },
        201,
      )
    ).body.workspace;
    assert.equal(second.onboardingStep, 'complete');
    assert.equal(second.branches.length, 1);
    assert.equal((await owner.get('/auth/session')).body.workspace.id, second.id);
    assert.deepEqual(
      (await owner.get('/workspaces')).body.workspaces.map((workspace) => workspace.id).sort(),
      [first.id, second.id].sort(),
    );
    await owner.mutate('put', '/workspace', {
      businessName: 'Renamed second',
      industry: 'Restaurant',
    });
    assert.equal((await deps.models.Workspace.findById(first.id).lean()).name, 'First business');
    assert.equal((await deps.models.Workspace.findById(second.id).lean()).name, 'Renamed second');
    const csrf = (await owner.get('/auth/session')).body.csrfToken;
    const firstNote = randomUUID(),
      secondNote = randomUUID();
    for (const [id, workspace] of [
      [firstNote, first],
      [secondNote, second],
    ])
      await deps.models.Notification.insertOne({
        _id: id,
        userId: owner.id,
        workspaceId: workspace.id,
        branchIds: [workspace.primaryBranchId],
        title: 'Saved notification',
        body: 'Authorized business event',
        createdAt: deps.now(),
        readAt: null,
      });
    const notes = (await owner.get('/account/notifications')).body.notifications;
    assert.ok(notes.some((note) => note.id === secondNote));
    assert.ok(!notes.some((note) => note.id === firstNote));
    await owner.agent
      .get('/api/v1/account/notifications')
      .set('X-Workspace-ID', first.id)
      .expect(409);
    await owner.agent
      .post('/api/v1/account/notifications/read')
      .set('Origin', deps.config.appOrigin)
      .set('X-CSRF-Token', csrf)
      .set('X-Workspace-ID', first.id)
      .send({ ids: [firstNote, secondNote] })
      .expect(409);
    await owner.agent
      .post('/api/v1/account/notifications/read')
      .set('Origin', deps.config.appOrigin)
      .set('X-CSRF-Token', csrf)
      .set('X-Workspace-ID', second.id)
      .send({ ids: [firstNote, secondNote] })
      .expect(200);
    assert.equal((await deps.models.Notification.findById(firstNote).lean()).readAt, null);
    assert.ok((await deps.models.Notification.findById(secondNote).lean()).readAt);
    assert.equal(workspaceBoundPath('/account/notifications', 'PUT'), false);

    const stale = await owner.agent
      .put('/api/v1/workspace')
      .set('Origin', deps.config.appOrigin)
      .set('X-CSRF-Token', csrf)
      .set('X-Workspace-ID', first.id)
      .send({ businessName: 'Stale tab overwrite', industry: 'Cafe' })
      .expect(409);
    assert.equal(stale.body.error.code, 'WORKSPACE_CHANGED');
    await owner.agent
      .put('/api/v1/workspace/setup')
      .set('Origin', deps.config.appOrigin)
      .set('X-CSRF-Token', csrf)
      .set('X-Workspace-ID', first.id)
      .send({ branchType: 'multiple', branchName: 'Stale primary overwrite' })
      .expect(409);
    await owner.agent.get('/api/v1/analytics').set('X-Workspace-ID', first.id).expect(409);
    const exportResponse = await owner.agent
      .get('/api/v1/feedback/export?expectedWorkspaceId=' + first.id)
      .expect(409);
    assert.equal(exportResponse.headers['content-disposition'], undefined);
    assert.equal((await deps.models.Workspace.findById(second.id).lean()).name, 'Renamed second');
    await owner.mutate(
      'patch',
      '/workspaces/' + first.id + '/branches/' + first.primaryBranchId,
      { name: 'Cross business overwrite' },
      404,
    );
    await owner.mutate('put', '/workspace/setup', {
      branchType: 'multiple',
      branchName: 'Second primary renamed',
    });
    assert.equal(
      (await deps.models.Branch.findById(first.primaryBranchId).lean()).name,
      'First branch',
    );
    await foreign.mutate('post', '/workspaces/' + second.id + '/select', {}, 404);
    assert.equal((await foreign.get('/workspaces')).body.workspaces.length, 1);
    const otherSession = createHttp(deps);
    await otherSession.mutate('post', '/auth/login', {
      email: 'multi-owner@example.test',
      password: 'Synthetic123',
    });
    const parallel = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? owner : otherSession).get('/auth/session'),
      ),
    );
    parallel.forEach((response, index) =>
      assert.equal(response.body.workspace.id, index % 2 ? second.id : first.id),
    );
    await owner.mutate('post', '/workspaces/' + first.id + '/select');
    assert.equal((await owner.get('/workspace')).body.businessName, 'First business');
    assert.equal((await deps.models.Workspace.findById(second.id).lean()).name, 'Renamed second');
  } finally {
    await deps.cleanup();
  }
});

test('multi workspace member selection keeps manager/viewer permissions and revoked scope isolated', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'multi-team-owner@example.test'),
      member = await account(deps, 'multi-member@example.test', false),
      first = owner.workspace;
    const second = (
      await owner.mutate(
        'post',
        '/workspaces',
        { businessName: 'Second team business', industry: 'Cafe' },
        201,
      )
    ).body.workspace;
    for (const [workspace, role] of [
      [first, 'viewer'],
      [second, 'manager'],
    ])
      await deps.models.Membership.insertOne({
        _id: randomUUID(),
        userId: member.id,
        workspaceId: workspace.id,
        role,
        branchIds: [workspace.primaryBranchId],
        revokedAt: null,
        createdAt: deps.now(),
        updatedAt: deps.now(),
      });
    assert.equal((await member.get('/workspaces')).body.workspaces.length, 2);
    await member.mutate('post', '/workspaces/' + second.id + '/select');
    assert.equal((await member.get('/workspace')).body.role, 'manager');
    await member.get('/feedback?branchId=' + first.primaryBranchId, 404);
    await member.mutate(
      'put',
      '/workspace',
      { businessName: 'Unauthorized owner edit', industry: 'Cafe' },
      403,
    );
    const question = {
      id: randomUUID(),
      type: 'long_text',
      label: 'Your experience',
      required: true,
    };
    await member.mutate(
      'post',
      '/surveys',
      { title: 'Manager draft', locale: 'en', questions: [question] },
      201,
    );
    await member.mutate('post', '/workspaces/' + first.id + '/select');
    await member.mutate(
      'post',
      '/surveys',
      { title: 'Viewer draft', locale: 'en', questions: [question] },
      403,
    );
    await member.mutate('post', '/workspaces/' + second.id + '/select');
    await deps.models.Membership.updateOne(
      { userId: member.id, workspaceId: second.id },
      { $set: { revokedAt: deps.now() } },
    );
    await member.get('/surveys', 404);
    assert.equal((await member.get('/auth/session')).body.workspace, null);
    assert.deepEqual(
      (await member.get('/workspaces')).body.workspaces.map((workspace) => workspace.id),
      [first.id],
    );
    await member.mutate('post', '/workspaces/' + first.id + '/select');
    assert.equal((await member.get('/workspace')).body.id, first.id);
  } finally {
    await deps.cleanup();
  }
});

test('legacy unique owner index requires explicit migration and preview never drops indexes', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'legacy-multi@example.test');
    await deps.models.Workspace.collection.createIndex(
      { ownerUserId: 1 },
      { unique: true, name: 'ownerUserId_1' },
    );
    const failed = await owner.mutate(
      'post',
      '/workspaces',
      { businessName: 'Blocked second', industry: 'Cafe' },
      409,
    );
    assert.equal(failed.body.error.code, 'WORKSPACE_MIGRATION_REQUIRED');
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: owner.id }), 1);
    const preview = await migrateWorkspaceIndex(deps.models.Workspace.collection);
    assert.equal(preview.mode, 'preview');
    assert.deepEqual(preview.remove, ['ownerUserId_1']);
    assert.ok(
      (await deps.models.Workspace.collection.indexes()).find(
        (index) => index.name === 'ownerUserId_1',
      )?.unique,
    );
    await migrateWorkspaceIndex(deps.models.Workspace.collection, { apply: true });
    assert.equal(
      (await deps.models.Workspace.findById(owner.workspace.id).lean()).name,
      'First business',
    );
    await owner.mutate(
      'post',
      '/workspaces',
      { businessName: 'Allowed second', industry: 'Cafe' },
      201,
    );
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: owner.id }), 2);
    assert.throws(
      () =>
        workspaceMigrationPlan([
          { name: 'custom_unique_owner', key: { ownerUserId: 1 }, unique: true },
        ]),
      /Manual index review/,
    );
  } finally {
    await deps.cleanup();
  }
});
