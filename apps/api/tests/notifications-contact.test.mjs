import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { decryptPayload } from '../src/modules/mail/crypto.mjs';
import {
  emitWorkspaceNotification,
  scheduleNotificationDigests,
} from '../src/modules/notifications/service.mjs';
import { deliverPendingMail } from '../src/modules/mail/worker.mjs';
async function account(deps, email) {
  const http = createHttp(deps),
    password = 'Synthetic123!';
  await http.mutate(
    'post',
    '/auth/register',
    { name: 'Synthetic owner', email, password, terms: true, locale: 'en' },
    201,
  );
  const user = await deps.models.User.findOne({ email }).lean();
  const job = await deps.models.MailOutbox.findOne({ userId: user._id, kind: 'verify' }).lean();
  await http.mutate('post', '/auth/verify-email', {
    token: decryptPayload(job.payload, deps.config.mailKey).token,
  });
  await http.mutate('post', '/auth/login', { email, password });
  return { http, user };
}
test('notifications isolate recipients and reads, enqueue private mail and schedule one digest', async () => {
  const deps = await createTestDatabase();
  try {
    const { http, user } = await account(deps, 'notifications@example.test');
    await http.mutate('put', '/workspace', {
      businessName: 'Saved business',
      industry: 'Cafe',
      locale: 'en',
    });
    const workspace = (
      await http.mutate('put', '/workspace/setup', { branchType: 'multiple', branchName: 'First' })
    ).body;
    const other = await account(deps, 'other-notifications@example.test');
    const branch = (
      await http.mutate('post', `/workspaces/${workspace.id}/branches`, { name: 'Second' }, 201)
    ).body;
    await deps.models.Membership.insertOne({
      _id: randomUUID(),
      workspaceId: workspace.id,
      userId: other.user._id,
      role: 'viewer',
      branchIds: [branch.id],
      createdAt: deps.now(),
      updatedAt: deps.now(),
      revokedAt: null,
    });
    await emitWorkspaceNotification(
      workspace.id,
      {
        type: 'feedback',
        title: 'New feedback',
        body: 'Saved response ready',
        branchId: workspace.primaryBranchId,
        path: '/feedbacks',
      },
      deps,
    );
    const notes = (await http.get('/account/notifications')).body.notifications;
    assert.equal(notes.length, 1);
    const unread = (await http.get('/account/notifications')).body;
    assert.equal(unread.unreadCount, 1);
    assert.equal(unread.feedbackUnreadCount, 1);
    assert.equal((await other.http.get('/account/notifications')).body.feedbackUnreadCount, 0);
    assert.equal((await other.http.get('/account/notifications')).body.notifications.length, 0);
    await other.http.mutate('post', '/account/notifications/read', { ids: [notes[0].id] });
    assert.equal((await http.get('/account/notifications')).body.notifications[0].readAt, null);
    let now = new Date('2026-10-26T09:30:00Z');
    deps.now = () => now;
    await scheduleNotificationDigests(deps);
    await scheduleNotificationDigests(deps);
    assert.equal(
      await deps.models.MailOutbox.countDocuments({ userId: user._id, kind: 'notification' }),
      1,
    );
    const outbox = await deps.models.MailOutbox.findOne({ kind: 'notification' }).lean();
    assert.ok(!JSON.stringify(outbox).includes('Saved response ready'));
    const sent = [];
    await deliverPendingMail(deps, { adapter: { send: async (message) => sent.push(message) } });
    assert.equal(sent.filter((m) => m.subject === 'NUVIA updates').length, 1);
    assert.equal(sent.find((m) => m.subject === 'NUVIA updates').to, 'notifications@example.test');
    now = new Date('2026-10-26T09:40:00Z');
    await scheduleNotificationDigests(deps);
    assert.equal(await deps.models.MailOutbox.countDocuments({ kind: 'notification' }), 1);
    await http.mutate('post', '/account/notifications/read', { ids: [notes[0].id] });
    assert.equal((await http.get('/account/notifications')).body.unreadCount, 0);
    assert.equal((await http.get('/account/notifications')).body.feedbackUnreadCount, 0);
    await deps.models.Notification.insertMany(
      Array.from({ length: 101 }, (_, index) => ({
        _id: randomUUID(),
        userId: user._id,
        workspaceId: workspace.id,
        branchIds: [workspace.primaryBranchId],
        kind: 'feedback',
        title: 'Saved feedback ' + index,
        body: 'Synthetic notification',
        path: '/feedbacks',
        readAt: null,
        createdAt: deps.now(),
      })),
    );
    const allUnread = (await http.get('/account/notifications')).body;
    assert.equal(allUnread.notifications.length, 100);
    assert.equal(allUnread.unreadCount, 101);
    assert.equal(allUnread.feedbackUnreadCount, 101);
  } finally {
    await deps.cleanup();
  }
});
test('public contact requests persist bounded validated inputs without exposing stored requests', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps);
    const body = { name: 'Contact owner', email: 'contact@example.test', company: 'Example cafe' };
    await http.agent
      .post('/api/v1/public/contact')
      .set('Origin', 'https://other.example')
      .send(body)
      .expect(403);
    await http.agent
      .post('/api/v1/public/contact')
      .set('Origin', deps.config.appOrigin)
      .send({ ...body, role: 'admin' })
      .expect(422);
    const result = await http.agent
      .post('/api/v1/public/contact')
      .set('Origin', deps.config.appOrigin)
      .send(body)
      .expect(202);
    assert.deepEqual(result.body, { status: 'accepted' });
    assert.equal(await deps.models.ContactRequest.countDocuments({ email: body.email }), 1);
    await http.get('/public/contact', 401);
  } finally {
    await deps.cleanup();
  }
});
