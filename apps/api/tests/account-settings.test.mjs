import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { decryptPayload } from '../src/modules/mail/crypto.mjs';
import { totp, verifyTotp } from '../src/modules/account/totp.mjs';
import { recoveryDigest } from '../src/modules/account/recovery.mjs';
import {
  emitWorkspaceNotification,
  emitUserNotification,
} from '../src/modules/notifications/service.mjs';
import { deliverPendingMail } from '../src/modules/mail/worker.mjs';

test('workspace notification lists follow business selection while account security stays global', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Multi-notice owner',
        email: 'multi-notice@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    const job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'multi-notice@example.test', password });
    const first = (
      await http.mutate('put', '/workspace', { businessName: 'First business', industry: 'Café' })
    ).body;
    await emitWorkspaceNotification(
      first.id,
      {
        title: 'Business A notice',
        body: 'A feedback notice.',
        type: 'feedback',
        path: '/feedbacks',
      },
      deps,
    );
    const second = (
      await http.mutate(
        'post',
        '/workspaces',
        { businessName: 'Second business', industry: 'Café' },
        201,
      )
    ).body.workspace;
    await emitWorkspaceNotification(
      second.id,
      { title: 'Business B notice', body: 'B feedback notice.', type: 'feedback' },
      deps,
    );
    const user = await deps.models.User.findOne({ email: 'multi-notice@example.test' }).lean();
    await emitUserNotification(
      user._id,
      { title: 'Global account notice', body: 'Your security settings changed.' },
      deps,
    );
    const notes = (await http.get('/account/notifications')).body.notifications;
    assert.ok(!notes.some((note) => note.title === 'Business A notice'));
    assert.ok(notes.some((note) => note.title === 'Business B notice'));
    assert.ok(notes.some((note) => note.title === 'Global account notice'));
    const firstRecord = await deps.models.Notification.findOne({
      title: 'Business A notice',
    }).lean();
    assert.match(firstRecord.path, new RegExp('workspace=' + first.id));
  } finally {
    await deps.cleanup();
  }
});

test('email-only notification preferences queue actual mail without showing an in-app notification', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Email-only owner',
        email: 'email-only@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    const job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'email-only@example.test', password });
    const workspace = (
      await http.mutate('put', '/workspace', {
        businessName: 'Email-only business',
        industry: 'Café',
      })
    ).body;
    const account = (await http.get('/account')).body;
    await http.mutate('put', '/account/notifications', {
      toggles: { ...account.toggles, inapp: false, email: true },
      delivery: 'Immediately',
    });
    await emitWorkspaceNotification(
      workspace.id,
      { title: 'Email-only fixture', body: 'Saved feedback is ready.', type: 'feedback' },
      deps,
    );
    const records = (await http.get('/account/notifications')).body.notifications;
    assert.ok(!records.some((note) => note.title === 'Email-only fixture'));
    const persisted = await deps.models.Notification.findOne({
      title: 'Email-only fixture',
    }).lean();
    assert.equal(persisted.inapp, false);
    const sent = [];
    await deliverPendingMail(deps, { adapter: { send: async (message) => sent.push(message) } });
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Email-only fixture/);
    await http.mutate('put', '/account/notifications', {
      toggles: { ...account.toggles, inapp: true, email: true },
      delivery: 'Immediately',
    });
    assert.ok(
      !(await http.get('/account/notifications')).body.notifications.some(
        (note) => note.id === persisted._id,
      ),
    );
  } finally {
    await deps.cleanup();
  }
});

test('recovery codes are shown once, hashed at rest and consumed atomically during real sign-in', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      recoveryBrowser = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Recovery codes owner',
        email: 'codes@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    const job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'codes@example.test', password });
    const setup = await http.mutate('post', '/account/two-factor/setup', {
      currentPassword: password,
    });
    const enabled = await http.mutate('post', '/account/two-factor', {
      currentPassword: password,
      enabled: true,
      code: totp(setup.body.secret),
    });
    assert.equal(enabled.body.recoveryCodes.length, 10);
    const [code] = enabled.body.recoveryCodes;
    assert.match(code, /^[a-f0-9]{4}(?:-[a-f0-9]{4}){4}$/);
    let user = await deps.models.User.findOne({ email: 'codes@example.test' }).lean();
    assert.equal(user.twoFactorRecoveryHashes.length, 10);
    assert.ok(user.twoFactorRecoveryHashes.includes(recoveryDigest(code)));
    assert.ok(!JSON.stringify(user).includes(code));
    assert.ok(!(await http.get('/account')).text.includes(code));
    await recoveryBrowser.mutate('post', '/auth/login', {
      email: 'codes@example.test',
      password,
      code,
    });
    await recoveryBrowser.mutate('post', '/auth/logout', {}, 204);
    await recoveryBrowser.mutate(
      'post',
      '/auth/login',
      { email: 'codes@example.test', password, code },
      401,
    );
    user = await deps.models.User.findOne({ email: 'codes@example.test' }).lean();
    assert.equal(user.twoFactorRecoveryHashes.length, 9);
    await http.mutate('post', '/account/two-factor', {
      currentPassword: password,
      enabled: false,
      code: totp(setup.body.secret),
    });
    assert.equal((await http.get('/account')).body.twoFA, false);
  } finally {
    await deps.cleanup();
  }
});

test('password recovery invalidates older pending email changes and essential security cannot be disabled', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Recovery owner',
        email: 'recover@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    let job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'recover@example.test', password });
    await http.mutate(
      'post',
      '/account/email',
      { email: 'pending@example.test', currentPassword: password },
      202,
    );
    job = await deps.models.MailOutbox.findOne({ kind: 'change-email', status: 'pending' }).lean();
    const staleToken = decryptPayload(job.payload, deps.config.mailKey).token;
    await http.mutate('post', '/auth/forgot-password', { email: 'recover@example.test' }, 202);
    job = await deps.models.MailOutbox.findOne({ kind: 'reset', status: 'pending' }).lean();
    await http.mutate('post', '/auth/reset-password', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
      password: 'ChangedSynthetic123!',
    });
    await http.mutate('post', '/auth/verify-email', { token: staleToken }, 400);
    await http.mutate('post', '/auth/login', {
      email: 'recover@example.test',
      password: 'ChangedSynthetic123!',
    });
    const account = (await http.get('/account')).body;
    assert.equal(account.pendingEmail, null);
    assert.ok(account.passwordChangedAt);
    await http.mutate(
      'put',
      '/account/notifications',
      { toggles: { ...account.toggles, security: false }, delivery: 'Immediately' },
      422,
    );
  } finally {
    await deps.cleanup();
  }
});
test('TOTP matches RFC SHA1 vector and rejects malformed or expired codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret, 59000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59000), true);
  assert.equal(verifyTotp(secret, '287082', 159000), false);
  assert.equal(verifyTotp(secret, 'abcdef', 59000), false);
});
test('approved account settings persist profile preferences and enforce TOTP and session ownership', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      other = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Settings owner',
        email: 'settings@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    const job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'settings@example.test', password });
    await other.get('/account', 401);
    const profile = await http.mutate('patch', '/account', {
      name: 'Saved owner',
      title: 'Founder',
      phone: '+20100',
      country: 'Egypt',
      photo: '',
    });
    assert.equal(profile.body.name, 'Saved owner');
    assert.equal(profile.body.phone, '+20100');
    assert.ok(!profile.text.includes('passwordHash'));
    await http.mutate('put', '/account/preferences', {
      language: 'ar',
      region: 'Egypt',
      zone: 'Africa/Cairo',
      date: 'DD/MM/YYYY',
      time: '24-Hour',
    });
    assert.equal((await http.get('/account')).body.preferences.zone, 'Africa/Cairo');
    const sessions = (await http.get('/account/sessions')).body.sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].current, true);
    assert.ok(!JSON.stringify(sessions).includes('digest'));
    await http.mutate('delete', '/account/sessions/' + sessions[0].id, {}, 400);
    await http.mutate('post', '/account/two-factor/setup', { currentPassword: 'incorrect' }, 401);
    const setup = await http.mutate('post', '/account/two-factor/setup', {
      currentPassword: password,
    });
    await http.mutate(
      'post',
      '/account/two-factor',
      { currentPassword: password, enabled: true, code: 'abcdef' },
      422,
    );
    await http.mutate('post', '/account/two-factor', {
      currentPassword: password,
      enabled: true,
      code: totp(setup.body.secret),
    });
    assert.equal((await http.get('/account')).body.twoFA, true);
    const user = await deps.models.User.findOne({ email: 'settings@example.test' }).lean();
    assert.ok(!JSON.stringify(user.twoFactorSecret).includes(setup.body.secret));
    await other.mutate('post', '/auth/login', { email: 'settings@example.test', password }, 401);
    await other.mutate('post', '/auth/login', {
      email: 'settings@example.test',
      password,
      code: totp(setup.body.secret),
    });
    const others = (await other.get('/account/sessions')).body.sessions;
    const foreign = others.find((s) => !s.current);
    assert.ok(foreign);
    await other.mutate('delete', '/account/sessions/' + foreign.id);
    await http.get('/account', 401);
  } finally {
    await deps.cleanup();
  }
});
test('email changes require new-address verification and cancel invalidates pending tokens', async () => {
  const deps = await createTestDatabase();
  try {
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      { name: 'Email owner', email: 'old@example.test', password, terms: true, locale: 'en' },
      201,
    );
    let job = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'old@example.test', password });
    await http.mutate(
      'post',
      '/account/email',
      { email: 'new@example.test', currentPassword: password },
      202,
    );
    assert.equal((await http.get('/account')).body.email, 'old@example.test');
    job = await deps.models.MailOutbox.findOne({ kind: 'change-email', status: 'pending' }).lean();
    const token = decryptPayload(job.payload, deps.config.mailKey).token;
    await http.mutate('delete', '/account/email');
    await http.mutate('post', '/auth/verify-email', { token }, 400);
    await http.mutate(
      'post',
      '/account/email',
      { email: 'new@example.test', currentPassword: password },
      202,
    );
    job = await deps.models.MailOutbox.findOne({ kind: 'change-email', status: 'pending' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(job.payload, deps.config.mailKey).token,
    });
    await http.get('/account', 401);
    await http.mutate('post', '/auth/login', { email: 'new@example.test', password });
    assert.equal((await http.get('/account')).body.email, 'new@example.test');
  } finally {
    await deps.cleanup();
  }
});
