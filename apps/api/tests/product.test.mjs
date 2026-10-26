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

test('approved survey actions persist pause resume duplicate archive and soft deletion without losing evidence', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'approved-survey@example.test'),
      other = await account(deps, 'approved-survey-other@example.test');
    const input = draft();
    input.questions[0].labelTranslations = { en: input.questions[0].label, ar: 'كيف كانت تجربتك؟' };
    const created = (await owner.mutate('post', '/surveys', input, 201)).body.survey;
    const live = (
      await owner.mutate('post', `/surveys/${created.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const link = live.links.find((link) => link.enabled);
    const publicView = await request(owner.app)
      .get(`/api/v1/public/surveys/${link.token}`)
      .expect(200);
    assert.equal(publicView.body.survey.questions[0].labelTranslations.ar, 'كيف كانت تجربتك؟');
    await other.mutate('post', `/surveys/${created.id}/pause`, {}, 404);
    const paused = (await owner.mutate('post', `/surveys/${created.id}/pause`, {})).body.survey;
    assert.equal(paused.status, 'paused');
    await request(owner.app).get(`/api/v1/public/surveys/${link.token}`).expect(404);
    const resumed = (await owner.mutate('post', `/surveys/${created.id}/resume`, {})).body.survey;
    assert.equal(resumed.status, 'published');
    const fresh = resumed.links.find((link) => link.enabled);
    assert.notEqual(fresh.token, link.token);
    const startId = randomUUID();
    await Promise.all(
      [1, 2].map(() =>
        request(owner.app)
          .post(`/api/v1/public/surveys/${fresh.token}/start`)
          .send({ startId, channel: 'qr' })
          .expect(200),
      ),
    );
    await request(owner.app)
      .post(`/api/v1/public/surveys/${fresh.token}/start`)
      .send({ startId: randomUUID(), channel: 'link' })
      .expect(200);
    assert.equal(await deps.models.SurveyStart.countDocuments({ surveyId: created.id }), 2);
    const responseKey = randomUUID();
    await request(owner.app)
      .post(`/api/v1/public/surveys/${fresh.token}/responses`)
      .send({
        answers: [
          { questionId: input.questions[0].id, value: 'Saved evidence' },
          { questionId: input.questions[1].id, value: 'Delivery' },
          { questionId: input.questions[2].id, value: 1 },
        ],
        locale: 'en',
        consent: true,
        startId,
        sourceChannel: 'qr',
        idempotencyKey: responseKey,
      })
      .expect(201);
    assert.equal(
      await deps.models.Notification.countDocuments({ userId: owner.id, kind: 'low' }),
      1,
    );
    await request(owner.app)
      .post(`/api/v1/public/surveys/${fresh.token}/responses`)
      .send({
        answers: [
          { questionId: input.questions[0].id, value: 'Saved evidence' },
          { questionId: input.questions[1].id, value: 'Delivery' },
          { questionId: input.questions[2].id, value: 1 },
        ],
        locale: 'en',
        consent: true,
        startId,
        sourceChannel: 'qr',
        idempotencyKey: responseKey,
      })
      .expect(201);
    assert.equal(
      await deps.models.Notification.countDocuments({ userId: owner.id, kind: 'low' }),
      1,
    );
    assert.equal((await owner.get(`/surveys/${created.id}`)).body.survey.responseCount, 1);
    assert.equal((await owner.get(`/surveys/${created.id}`)).body.survey.responsesByChannel.qr, 1);
    const completion = (await owner.get('/analytics')).body;
    assert.equal(completion.startedSessions, 2);
    assert.equal(completion.completedSessions, 1);
    assert.equal(completion.completionRate, 0.5);
    assert.equal((await other.get('/analytics')).body.startedSessions, 0);
    assert.equal((await owner.get('/analytics?language=en')).body.completionRate, null);
    const copy = (await owner.mutate('post', `/surveys/${created.id}/duplicate`, {})).body.survey;
    assert.notEqual(copy.id, created.id);
    assert.equal(copy.status, 'draft');
    assert.notEqual(copy.questions[0].id, input.questions[0].id);
    await owner.mutate('post', `/surveys/${copy.id}/archive`, {});
    assert.equal(
      (await owner.get('/surveys')).body.surveys.some((s) => s.id === copy.id),
      false,
    );
    await owner.mutate('post', `/surveys/${created.id}/delete`, {});
    await owner.get(`/surveys/${created.id}`, 404);
    await request(owner.app).get(`/api/v1/public/surveys/${fresh.token}`).expect(404);
    assert.equal(await deps.models.Response.countDocuments({ surveyId: created.id }), 1);
    assert.ok(await deps.models.SurveyRevision.countDocuments({ surveyId: created.id }));
  } finally {
    await deps.cleanup();
  }
});

test('CSV export rejects invalid segment filters before starting a download', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'csv-invalid@example.test');
    const response = await owner.agent
      .get('/api/v1/feedback/export?segment=invalid-json')
      .timeout({ deadline: 2000 })
      .expect(422);
    assert.match(response.headers['content-type'], /application\/json/);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.headers['content-disposition'], undefined);
  } finally {
    await deps.cleanup();
  }
});

test('published survey privacy and enabled languages are immutable and optional contact stays authorized', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'survey-privacy@example.test'),
      input = draft();
    const created = (
      await owner.mutate(
        'post',
        '/surveys',
        { ...input, anonymous: true, enabledLanguages: ['en', 'ar'] },
        201,
      )
    ).body.survey;
    const live = (
      await owner.mutate('post', `/surveys/${created.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const first = live.links.find((link) => link.enabled);
    const body = {
      answers: [
        { questionId: input.questions[0].id, value: 'Private survey feedback' },
        { questionId: input.questions[1].id, value: 'Delivery' },
      ],
      locale: 'en',
      consent: true,
      idempotencyKey: randomUUID(),
      respondent: { name: 'Synthetic customer', email: 'customer@example.test' },
    };
    await request(owner.app)
      .post(`/api/v1/public/surveys/${first.token}/responses`)
      .send(body)
      .expect(422);
    await owner.mutate('patch', `/surveys/${created.id}`, {
      anonymous: false,
      enabledLanguages: ['en'],
      revision: created.revision,
    });
    await request(owner.app)
      .post(`/api/v1/public/surveys/${first.token}/responses`)
      .send(body)
      .expect(422);
    const secondLive = (
      await owner.mutate('post', `/surveys/${created.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const second = secondLive.links.find((link) => link.enabled);
    const published = (
      await request(owner.app).get(`/api/v1/public/surveys/${second.token}`).expect(200)
    ).body.survey;
    assert.equal(published.anonymous, false);
    assert.deepEqual(published.enabledLanguages, ['en']);
    await request(owner.app)
      .post(`/api/v1/public/surveys/${second.token}/responses`)
      .send({ ...body, locale: 'ar' })
      .expect(422);
    const response = (
      await request(owner.app)
        .post(`/api/v1/public/surveys/${second.token}/responses`)
        .send(body)
        .expect(201)
    ).body.response;
    assert.deepEqual(
      (await deps.models.Response.findById(response.id).lean()).respondent,
      body.respondent,
    );
    assert.deepEqual(
      (await owner.get(`/feedback/${response.id}`)).body.response.respondent,
      body.respondent,
    );
    await request(owner.app)
      .post(`/api/v1/public/surveys/${second.token}/responses`)
      .send({ ...body, idempotencyKey: randomUUID(), respondent: { name: 'x'.repeat(121) } })
      .expect(422);
    const { respondent: ignored, ...withoutContact } = body;
    void ignored;
    await request(owner.app)
      .post(`/api/v1/public/surveys/${second.token}/responses`)
      .send({ ...withoutContact, idempotencyKey: randomUUID() })
      .expect(201);
  } finally {
    await deps.cleanup();
  }
});

test('CSV export terminates a partial download when its database cursor fails', async () => {
  const deps = await createTestDatabase();
  const originalFind = deps.models.Response.find;
  try {
    const owner = await account(deps, 'csv-stream-failure@example.test');
    const input = draft();
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
          { questionId: input.questions[0].id, value: 'Saved response before cursor failure' },
          { questionId: input.questions[1].id, value: 'Delivery' },
        ],
        locale: 'en',
        consent: true,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    deps.models.Response.find = function (...args) {
      const query = originalFind.apply(this, args);
      const originalCursor = query.cursor;
      query.cursor = function (...cursorArgs) {
        const cursor = originalCursor.apply(this, cursorArgs);
        return (async function* () {
          try {
            for await (const row of cursor) {
              yield row;
              throw new Error('Synthetic private cursor failure');
            }
          } finally {
            await cursor.close();
          }
        })();
      };
      return query;
    };
    await assert.rejects(
      owner.agent.get('/api/v1/feedback/export').timeout({ deadline: 2000 }),
      (error) => {
        assert.notEqual(
          error.code,
          'ECONNABORTED',
          'A broken download must terminate rather than hang until the client deadline',
        );
        assert.match(error.message, /aborted|socket hang up/i);
        assert.ok(!error.message.includes('Synthetic private cursor failure'));
        return true;
      },
    );
  } finally {
    deps.models.Response.find = originalFind;
    await deps.cleanup();
  }
});

test('all six question types validate bounds and preserve multiple-choice segments and immutable revisions', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'question-types@example.test');
    const types = ['short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'nps'];
    const questions = types.map((type) => ({
      id: randomUUID(),
      type,
      label: type,
      required: true,
      ...(['single_choice', 'multiple_choice'].includes(type)
        ? { options: ['Delivery', 'Dine in'], segment: true }
        : {}),
    }));
    const input = { title: 'All question types', description: '', locale: 'en', questions };
    const survey = (await owner.mutate('post', '/surveys', input, 201)).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, {
        branchIds: [owner.workspace.primaryBranchId],
      })
    ).body.survey;
    const endpoint = `/api/v1/public/surveys/${published.links[0].token}/responses`;
    const values = [
      '=SUM(1,2)',
      'Arabic عربي and English',
      'Delivery',
      ['Delivery', 'Dine in'],
      5,
      0,
    ];
    const payload = {
      answers: questions.map((q, index) => ({ questionId: q.id, value: values[index] })),
      locale: 'en',
      consent: true,
      idempotencyKey: randomUUID(),
    };
    for (const [index, value] of [
      [0, 'x'.repeat(501)],
      [2, 'Unknown'],
      [3, ['Delivery', 'Delivery']],
      [4, 6],
      [4, 1.5],
      [5, -1],
      [5, 11],
    ]) {
      const invalid = structuredClone(payload);
      invalid.answers[index].value = value;
      await request(owner.app).post(endpoint).send(invalid).expect(422);
    }
    await request(owner.app)
      .post(endpoint)
      .send({ ...payload, answers: [...payload.answers, payload.answers[0]] })
      .expect(422);
    await request(owner.app).post(endpoint).send(payload).expect(201);
    const conflict = structuredClone(payload);
    conflict.answers[0].value = 'Changed payload';
    await request(owner.app).post(endpoint).send(conflict).expect(409);
    const segment = encodeURIComponent(JSON.stringify({ [questions[3].id]: 'Delivery' }));
    const feedback = (await owner.get(`/feedback?segment=${segment}`)).body;
    assert.equal(feedback.total, 1);
    assert.deepEqual(feedback.responses[0].segments[questions[3].id], ['Delivery', 'Dine in']);
    const analytics = (await owner.get(`/analytics?segment=${segment}`)).body;
    assert.equal(analytics.totalResponses, 1);
    assert.equal(
      analytics.segmentComparisons.filter((g) => g.questionId === questions[3].id).length,
      2,
    );
    const csv = await owner.get(`/feedback/export?segment=${segment}`);
    assert.ok(csv.text.includes("'=SUM(1,2)"), 'Formula-leading response text must be escaped');
    const changedQuestions = questions.map((q, index) =>
      index === 0 ? { ...q, type: 'long_text' } : q,
    );
    await owner.mutate('patch', `/surveys/${survey.id}`, {
      questions: changedQuestions,
      revision: 1,
    });
    const old = (await owner.get(`/feedback/${feedback.responses[0].id}`)).body.response;
    assert.equal(old.questions[0].type, 'short_text');
    assert.equal(old.revision, 1);
    const templates = (await owner.get('/survey-templates')).body.templates;
    assert.equal(templates.length, 6);
    const template = structuredClone(templates[0]);
    await owner.mutate(
      'post',
      '/surveys',
      {
        title: 'Copied template',
        description: template.description,
        locale: template.locale,
        questions: template.questions,
      },
      201,
    );
    assert.deepEqual((await owner.get('/survey-templates')).body.templates[0], template);
  } finally {
    await deps.cleanup();
  }
});

test('membership scope reduction immediately hides mixed-branch reports, jobs and export data', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'scope-owner@example.test');
    const member = await account(deps, 'scope-manager@example.test', false);
    const branchA = owner.workspace.primaryBranchId;
    const branchB = (
      await owner.mutate(
        'post',
        `/workspaces/${owner.workspace.id}/branches`,
        { name: 'Giza' },
        201,
      )
    ).body.id;
    const input = draft();
    const survey = (await owner.mutate('post', '/surveys', input, 201)).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, { branchIds: [branchA, branchB] })
    ).body.survey;
    for (const link of published.links) {
      await request(owner.app)
        .post(`/api/v1/public/surveys/${link.token}/responses`)
        .send({
          answers: [
            {
              questionId: input.questions[0].id,
              value: link.branchId === branchA ? 'Private Cairo feedback' : 'Allowed Giza feedback',
            },
            { questionId: input.questions[1].id, value: 'Delivery' },
          ],
          locale: 'en',
          consent: true,
          idempotencyKey: randomUUID(),
        })
        .expect(201);
    }
    const invitation = (
      await owner.mutate(
        'post',
        '/team/invitations',
        {
          email: 'scope-manager@example.test',
          role: 'manager',
          branchIds: [branchA, branchB],
        },
        201,
      )
    ).body.invitation;
    await member.mutate('post', '/team/accept', {
      token: new URL(invitation.acceptUrl).hash.split('token=')[1],
    });
    const report = (await member.mutate('post', '/reports', { locale: 'en', filters: {} }, 201))
      .body.report;
    assert.equal(report.metrics.totalResponses, 2);
    const membership = (await owner.get('/team')).body.members.find((m) => m.userId === member.id);
    await owner.mutate('patch', `/team/members/${membership.id}`, { branchIds: [branchB] });
    const session = (await member.get('/auth/session')).body;
    assert.equal(session.workspace.primaryBranchId, null);
    assert.equal(session.workspace.branches.length, 1);
    const allowed = (await member.get('/feedback')).body;
    assert.equal(allowed.total, 1);
    assert.equal(allowed.responses[0].text, 'Allowed Giza feedback');
    assert.equal((await member.get('/analytics')).body.totalResponses, 1);
    await member.get(`/reports/${report.id}`, 404);
    await member.get(`/reports/${report.id}/export`, 404);
    assert.equal((await member.get('/reports')).body.reports.length, 0);
    const jobs = (await member.get('/analysis/jobs')).body.jobs;
    assert.equal(jobs.length, 5);
    assert.ok(jobs.every((job) => job.responseId === allowed.responses[0].id));
    const csv = await member.get('/feedback/export?pageSize=1');
    assert.ok(csv.text.includes('Allowed Giza feedback'));
    assert.ok(!csv.text.includes('Private Cairo feedback'));
    const denied = await member.agent
      .get(`/api/v1/feedback/export?branchId=${branchA}`)
      .timeout({ deadline: 2000 })
      .expect(404);
    assert.equal(denied.body.error.code, 'NOT_FOUND');
    assert.equal(denied.headers['content-disposition'], undefined);
    await member.mutate('patch', `/surveys/${survey.id}`, { title: 'Unauthorized edit' }, 404);
    await member.mutate(
      'put',
      '/business-page',
      { slug: 'scope-business', enabled: true, description: '', logoUrl: '', contactUrl: '' },
      403,
    );
    await owner.mutate('patch', `/team/members/${membership.id}`, { role: 'viewer' });
    await member.mutate('post', '/analysis/retry', {}, 403);
    await member.mutate('post', '/reports', { locale: 'en', filters: {} }, 403);
    await member.mutate('post', '/surveys', draft(), 403);
    await owner.mutate('delete', `/team/members/${membership.id}`, {}, 204);
    await member.get('/feedback/export', 404);
    await member.get('/analysis/jobs', 404);
  } finally {
    await deps.cleanup();
  }
});

test('public business pages publish only enabled branch revisions and expose no private account data', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'public-page@example.test');
    const other = await account(deps, 'slug-conflict@example.test');
    const branchA = owner.workspace.primaryBranchId;
    const branchB = (
      await owner.mutate(
        'post',
        `/workspaces/${owner.workspace.id}/branches`,
        { name: 'Giza' },
        201,
      )
    ).body.id;
    const survey = (await owner.mutate('post', '/surveys', draft(), 201)).body.survey;
    const published = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, { branchIds: [branchA, branchB] })
    ).body.survey;
    const page = {
      slug: 'public-cafe',
      enabled: true,
      description: 'Public description',
      logoUrl: 'https://example.test/logo.png',
      contactUrl: 'https://example.test/contact',
    };
    await owner.mutate('put', '/business-page', page);
    await other.mutate('put', '/business-page', page, 409);
    await owner.mutate('put', '/business-page', { ...page, logoUrl: 'javascript:alert(1)' }, 422);
    await owner.mutate('patch', `/surveys/${survey.id}`, {
      title: 'New branch revision',
      revision: 1,
    });
    const replacement = (
      await owner.mutate('post', `/surveys/${survey.id}/publish`, { branchIds: [branchA] })
    ).body.survey;
    const publicPage = (
      await request(owner.app).get('/api/v1/public/business/public-cafe').expect(200)
    ).body;
    assert.equal(publicPage.surveys.length, 2);
    assert.equal(
      publicPage.surveys.find((s) => s.branch.id === branchA).title,
      'New branch revision',
    );
    assert.equal(publicPage.surveys.find((s) => s.branch.id === branchB).title, survey.title);
    const oldA = published.links.find((link) => link.branchId === branchA);
    await request(owner.app).get(`/api/v1/public/surveys/${oldA.token}`).expect(404);
    const oldB = published.links.find((link) => link.branchId === branchB);
    await request(owner.app).get(`/api/v1/public/surveys/${oldB.token}`).expect(200);
    assert.ok(
      replacement.links.some(
        (link) => link.branchId === branchA && link.enabled && link.revision === 2,
      ),
    );
    const serialized = JSON.stringify(publicPage);
    assert.ok(!serialized.includes('public-page@example.test'));
    assert.ok(!serialized.includes(owner.id));
    assert.ok(!serialized.includes(owner.workspace.id));
    await owner.mutate('put', '/business-page', { ...page, enabled: false });
    await request(owner.app).get('/api/v1/public/business/public-cafe').expect(404);
    await request(owner.app).get(`/api/v1/public/surveys/${oldB.token}`).expect(200);
  } finally {
    await deps.cleanup();
  }
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

test('ordinary account and plan reads do not consume protected mutation budgets', async () => {
  const deps = await createTestDatabase();
  try {
    const owner = await account(deps, 'read-budget@example.test');
    for (let i = 0; i < 121; i++) await owner.get('/account');
    for (let i = 0; i < 35; i++) await owner.get('/billing');
    await owner.mutate('patch', '/account', { name: 'Saved after navigation' });
    assert.equal((await owner.get('/account')).body.name, 'Saved after navigation');
  } finally {
    await deps.cleanup();
  }
});
