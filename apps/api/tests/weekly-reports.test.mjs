import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { decryptPayload } from '../src/modules/mail/crypto.mjs';
import { scheduleWeeklyReports, weeklyReportWindow } from '../src/modules/reports/weekly.mjs';

test('weekly report windows follow the saved timezone and include its previous seven full calendar days', () => {
  assert.equal(weeklyReportWindow(new Date('2026-10-26T08:30:00Z'), 'UTC'), null);
  assert.deepEqual(weeklyReportWindow(new Date('2026-10-26T09:30:00Z'), 'UTC'), {
    week: '2026-10-26',
    timezone: 'UTC',
    from: '2026-10-19T00:00:00.000Z',
    to: '2026-10-25T23:59:59.999Z',
    interval: 'day',
  });
  const cairo = weeklyReportWindow(new Date('2026-10-26T06:30:00Z'), 'Africa/Cairo');
  assert.equal(cairo.from, '2026-10-18T21:00:00.000Z');
  assert.equal(cairo.to, '2026-10-25T20:59:59.999Z');
});

test('weekly snapshots require explicit saved opt-in and create one real waiting report per business/week', async () => {
  const deps = await createTestDatabase();
  try {
    let now = new Date('2026-10-20T12:00:00Z');
    deps.now = () => now;
    deps.fetch = () => {
      throw new Error('Scheduling must not call a model or external provider');
    };
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      { name: 'Weekly owner', email: 'weekly@example.test', password, terms: true, locale: 'en' },
      201,
    );
    const mail = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(mail.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', {
      email: 'weekly@example.test',
      password,
      remember: true,
    });
    await http.mutate('put', '/workspace', { businessName: 'Weekly business', industry: 'Café' });
    const workspace = (
      await http.mutate('put', '/workspace/setup', { branchType: 'single', branchName: 'Main' })
    ).body;
    const questionId = randomUUID();
    const survey = (
      await http.mutate(
        'post',
        '/surveys',
        {
          title: 'Weekly survey',
          description: '',
          locale: 'en',
          questions: [{ id: questionId, type: 'long_text', label: 'Your review', required: true }],
        },
        201,
      )
    ).body.survey;
    const live = (
      await http.mutate('post', '/surveys/' + survey.id + '/publish', {
        branchIds: [workspace.primaryBranchId],
      })
    ).body.survey;
    await request(http.app)
      .post('/api/v1/public/surveys/' + live.links[0].token + '/responses')
      .send({
        answers: [{ questionId, value: 'Saved weekly evidence' }],
        locale: 'en',
        consent: true,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    now = new Date('2026-10-26T09:30:00Z');
    assert.equal((await scheduleWeeklyReports(deps)).created, 0);
    assert.equal(await deps.models.Report.countDocuments(), 0);
    const account = (await http.get('/account')).body;
    await http.mutate('put', '/account/notifications', {
      toggles: { ...account.toggles, weekly: true },
      delivery: 'Weekly digest',
    });
    const attempts = await Promise.all([scheduleWeeklyReports(deps), scheduleWeeklyReports(deps)]);
    assert.equal(
      attempts.reduce((sum, attempt) => sum + attempt.created, 0),
      1,
    );
    assert.equal(await deps.models.Report.countDocuments(), 1);
    const report = await deps.models.Report.findOne().lean();
    assert.equal(report.status, 'waiting_for_model');
    assert.equal(report.metrics.totalResponses, 1);
    assert.equal(report.evidence[0].text, 'Saved weekly evidence');
    assert.equal(report.schedule.kind, 'weekly');
    assert.equal(report.scheduleKey, 'weekly:' + workspace.id + ':2026-10-26');
    assert.equal(await deps.models.AnalysisJob.countDocuments({ reportId: report._id }), 1);
    const notification = await deps.models.Notification.findOne({ kind: 'weekly' }).lean();
    assert.match(notification.body, /waiting for a compatible model/);
    assert.match(notification.path, new RegExp('workspace=' + workspace.id));
    assert.equal((await scheduleWeeklyReports(deps)).created, 0);
    await http.mutate('put', '/account/notifications', {
      toggles: { ...account.toggles, weekly: false },
      delivery: 'Weekly digest',
    });
    now = new Date('2026-11-02T09:30:00Z');
    assert.equal((await scheduleWeeklyReports(deps)).created, 0);
  } finally {
    await deps.cleanup();
  }
});
