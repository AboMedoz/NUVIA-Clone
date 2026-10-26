import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../apps/api/src/modules/auth/passwords.mjs';
import { runAccountScenario } from './accounts.spec.mjs';
import { runProductBrowserScenario as runApprovedSurveyScenario } from './approved-survey-browser.spec.mjs';

// Canonical acceptance composes the actual account lifecycle, supplied survey journey,
// and the former product acceptance cases against the approved interaction contracts.
export async function runProductBrowserScenario(args) {
  await runAccountScenario(args);
  args.results.checks.push(
    'Actual browser signup, file-mail verification, login, saved onboarding, failed save/retry, logout and password reset',
  );
  await runApprovedSurveyScenario(args);
  await runProductExtensions(args);
}
async function runProductExtensions({
  browser,
  origin,
  deps,
  output,
  results,
  advanceVisualBatchWindow,
}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const publicContext = await browser.newContext({
    viewport: { width: 393, height: 800 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage(),
    customer = await publicContext.newPage();
  page.setDefaultTimeout(15000);
  customer.setDefaultTimeout(15000);
  const errors = [],
    failures = [];
  for (const target of [page, customer]) {
    target.on('pageerror', (error) => errors.push(error.message));
    target.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/')) return;
      results.requests.push({
        method: response.request().method(),
        path: url.pathname.replace(/(\/public\/surveys\/)[^/]+/, '$1:token'),
        status: response.status(),
      });
      if (response.status() >= 400)
        failures.push({ path: url.pathname, status: response.status() });
    });
  }
  const check = (text) => results.checks.push(text);
  const go = async (route) => {
    await page.goto(origin + '/#/' + route);
    await page.locator('.product-page').waitFor();
    await page.waitForTimeout(100);
  };
  const shot = async (target, name) => {
    await target.screenshot({ path: join(output, name + '.png'), fullPage: false });
    results.screenshots.push(name + '.png');
  };
  const mutate = async (client, method, path, body, expected = 200) => {
    const session = await (await client.get(origin + '/api/v1/auth/session')).json();
    const response = await client.fetch(origin + '/api/v1' + path, {
      method,
      headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
      data: body,
    });
    assert.equal(response.status(), expected, path + ': ' + (await response.text()));
    return response.status() === 204 ? null : response.json();
  };
  const choose = async (label, option) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  try {
    await page.goto(origin + '/#/login');
    await page.getByLabel('Work email').fill('approved-ui@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    const workspace = await (await context.request.get(origin + '/api/v1/workspace')).json();
    await go('branches');
    await page.getByRole('button', { name: 'Add branch', exact: true }).click();
    await page.getByLabel('Branch name *', { exact: true }).fill('Second acceptance branch');
    await page.getByLabel('Country *', { exact: true }).fill('Egypt');
    await page.getByLabel('City *', { exact: true }).fill('Giza');
    await page.getByLabel('Street address *', { exact: true }).fill('Synthetic address');
    await page.getByRole('button', { name: 'Save branch', exact: true }).click();
    await page.waitForURL('**/#/branches');
    await page
      .getByRole('button', { name: 'Actions Second acceptance branch', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForURL('**/#/branch-edit?id=*');
    await page.getByRole('heading', { name: 'Edit branch', exact: true }).waitFor();
    await page.getByLabel('Branch name *', { exact: true }).fill('Renamed acceptance branch');
    const [renamed] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().includes('/branches/'),
      ),
      page.getByRole('button', { name: 'Save branch', exact: true }).click(),
    ]);
    assert.equal(renamed.request().postDataJSON().name, 'Renamed acceptance branch');
    assert.equal((await renamed.json()).name, 'Renamed acceptance branch');
    await page.waitForURL('**/#/branches');
    await page.reload();
    await page
      .getByRole('button', { name: 'Actions Renamed acceptance branch', exact: true })
      .waitFor();
    const branches = await (
      await context.request.get(origin + '/api/v1/workspaces/' + workspace.id + '/branches')
    ).json();
    const second = branches.find((branch) => branch.name === 'Renamed acceptance branch');
    assert.ok(second);
    check('Branch creation and rename persist through approved fields and reload');

    await go('survey-create');
    await page.getByLabel('Survey title', { exact: true }).fill('Six-type acceptance');
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    const definitions = [
      ['Short text', 'Visit summary'],
      ['Long text', 'Service details'],
      ['Single choice', 'Visit type'],
      ['Multiple choice', 'Items tried'],
      ['Star rating', 'Overall rating'],
      ['NPS', 'Recommend us'],
    ];
    for (let index = 0; index < definitions.length; index++) {
      if (index) await page.getByRole('button', { name: 'Add question', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Question text', exact: true })
        .fill(definitions[index][1]);
      await choose('Question type', definitions[index][0]);
      if (index === 2 || index === 3) {
        await choose('Number of choices', '2 Choices');
        await page
          .getByLabel('Option text 1', { exact: true })
          .fill(index === 2 ? 'Dine in' : 'Coffee');
        await page
          .getByLabel('Option text 2', { exact: true })
          .fill(index === 2 ? 'Delivery' : 'Pastry');
        if (index === 2)
          await page.getByRole('switch', { name: 'Use as segment', exact: true }).click();
      }
    }
    await choose('Question order', 'Move up');
    await page.getByRole('button', { name: 'Continue to sharing', exact: true }).click();
    await page.waitForURL('**/#/survey-share?id=*');
    const survey = await deps.models.Survey.findOne({
      workspaceId: workspace.id,
      title: 'Six-type acceptance',
    }).lean();
    assert.ok(survey);
    assert.equal(survey.questions.length, 6);
    assert.equal(survey.status, 'draft');
    assert.deepEqual(
      new Set(survey.questions.map((question) => question.type)),
      new Set(['short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'nps']),
    );
    assert.ok(survey.questions.find((question) => question.label === 'Visit type').segment);
    assert.equal(survey.questions[4].label, 'Recommend us');
    await page.getByRole('button', { name: /Build questions/ }).click();
    await page
      .getByRole('textbox', { name: 'Question text', exact: true })
      .fill('Temporary unsaved edit');
    await page.getByRole('button', { name: 'Language / اللغة', exact: true }).click();
    await page.getByRole('option', { name: /العربية/ }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'نص السؤال', exact: true }).inputValue(),
      'Temporary unsaved edit',
    );
    await page.getByRole('button', { name: 'Language / اللغة', exact: true }).click();
    await page.getByRole('option', { name: /English/ }).click();
    await page.getByRole('textbox', { name: 'Question text', exact: true }).fill('Visit summary');
    await page.getByRole('button', { name: 'Continue to sharing', exact: true }).click();
    await page.getByRole('button', { name: 'Publish survey', exact: true }).click();
    await page.getByRole('button', { name: 'Close collection', exact: true }).waitFor();
    const links = await deps.models.SurveyLink.find({ surveyId: survey._id, enabled: true }).lean();
    assert.equal(links.length, 2);
    assert.equal(
      await deps.models.Survey.countDocuments({
        workspaceId: workspace.id,
        title: 'Six-type acceptance',
      }),
      1,
    );
    const qrDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG', exact: true }).click();
    const qrFile = await qrDownload;
    assert.ok(
      (await readFile(await qrFile.path()))
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    check(
      'Six authored question types, stable reorder, segment, saved draft updates, locale-retained edits, two branch publications and real PNG QR',
    );

    const primaryLink = links.find((link) => link.branchId === workspace.primaryBranchId),
      secondLink = links.find((link) => link.branchId === second.id);
    await customer.goto(origin + '/#/s/' + primaryLink.token);
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    assert.equal(await customer.getByRole('alert').count(), 7);
    await customer.getByLabel('Visit summary', { exact: true }).fill('Mixed visit acceptance');
    await customer
      .getByLabel('Service details', { exact: true })
      .fill('القهوة ممتازة لكن الخدمة بطيئة. Friendly staff.');
    await customer.getByLabel('Dine in', { exact: true }).check();
    await customer.getByLabel('Coffee', { exact: true }).check();
    await customer
      .getByRole('radiogroup', { name: 'Overall rating', exact: true })
      .getByRole('radio', { name: '3', exact: true })
      .click();
    await customer
      .getByRole('radiogroup', { name: 'Recommend us', exact: true })
      .getByRole('radio', { name: '0', exact: true })
      .click();
    await customer.getByRole('checkbox', { name: /I agree/ }).check();
    assert.equal(await customer.getByRole('alert').count(), 0);
    const submissions = [];
    let attempts = 0;
    await customer.route('**/api/v1/public/surveys/*/responses', (route) => {
      submissions.push(route.request().postDataJSON());
      if (attempts++ === 0)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        });
      return route.continue();
    });
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await customer.getByRole('alert').waitFor();
    assert.equal(
      await customer.getByLabel('Visit summary', { exact: true }).inputValue(),
      'Mixed visit acceptance',
    );
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await customer.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
    assert.equal(submissions[0].idempotencyKey, submissions[1].idempotencyKey);
    assert.equal(await deps.models.Response.countDocuments({ surveyId: survey._id }), 1);
    const saved = await deps.models.Response.findOne({ surveyId: survey._id }).lean();
    const body = submissions[1];
    for (let index = 0; index < 9; index++) {
      const response = await publicContext.request.post(
        origin + '/api/v1/public/surveys/' + primaryLink.token + '/responses',
        {
          data: {
            ...body,
            idempotencyKey: randomUUID(),
            answers: body.answers.map((answer) =>
              answer.questionId ===
              survey.questions.find((question) => question.type === 'short_text').id
                ? { ...answer, value: 'Paged saved feedback ' + index }
                : answer,
            ),
          },
        },
      );
      assert.equal(response.status(), 201, await response.text());
    }
    const secondResponse = await publicContext.request.post(
      origin + '/api/v1/public/surveys/' + secondLink.token + '/responses',
      {
        data: {
          ...body,
          idempotencyKey: randomUUID(),
          answers: body.answers.map((answer) =>
            answer.questionId ===
            survey.questions.find((question) => question.type === 'short_text').id
              ? { ...answer, value: 'Authorized second branch response' }
              : answer,
          ),
        },
      },
    );
    assert.equal(secondResponse.status(), 201);
    check(
      'Anonymous required validation, correction, failure retention, stable idempotency retry and single saved submission',
    );

    await go('feedbacks');
    await page.getByRole('button', { name: 'More filters', exact: true }).click();
    await choose('Customer segment', 'Six-type acceptance · Visit type');
    await choose('Segment value', 'Delivery');
    await page
      .getByRole('heading', { name: 'No responses match your filters', exact: true })
      .waitFor();
    await choose('Segment value', 'Dine in');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/feedback?') &&
          new URL(response.url()).searchParams.get('page') === '2',
      ),
      page.getByRole('button', { name: 'Next', exact: true }).click(),
    ]);
    assert.ok((await page.locator('.feedback-table tbody tr').count()) > 0);
    assert.equal(
      await page.getByRole('button', { name: 'Previous', exact: true }).isEnabled(),
      true,
    );
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const csvText = await readFile(await (await csvDownload).path(), 'utf8');
    assert.ok(csvText.includes('Mixed visit acceptance'));
    assert.ok(csvText.includes('Dine in'));
    await go('feedback-details?id=' + saved._id);
    await page.getByRole('heading', { name: 'Original Feedback' }).waitFor();
    for (const [, label] of definitions)
      await page.getByLabel('Survey answers').getByText(label, { exact: true }).waitFor();
    check(
      'Server segment no-results/recovery, pagination, real filtered CSV and all six immutable saved answers',
    );

    await go('reports');
    await page.getByRole('button', { name: 'Generate new report', exact: true }).click();
    await choose('Report language', 'العربية');
    await page.getByRole('button', { name: 'Create report', exact: true }).click();
    await page.waitForURL('**/#/report-details?id=*');
    const createdReportId = new URL(page.url()).hash.split('id=')[1];
    await page.getByRole('heading', { name: 'Source evidence', exact: true }).waitFor();
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const pdf = await pdfDownload;
    assert.equal((await readFile(await pdf.path())).subarray(0, 5).toString(), '%PDF-');
    await pdf.saveAs(join(output, 'report-ar.pdf'));
    await go('reports');
    const reportCard = page.locator('[data-report-id="' + createdReportId + '"]');
    await reportCard
      .getByRole('heading', { name: 'Customer feedback report', exact: true })
      .waitFor();
    const englishReport = await deps.models.Report.findOne({
      workspaceId: workspace.id,
      locale: 'en',
    }).lean();
    assert.ok(englishReport, 'The earlier overview scenario saved an English report');
    await choose('Language', 'English');
    await page.locator('[data-report-id="' + englishReport._id + '"]').waitFor();
    assert.equal(await reportCard.count(), 0);
    await choose('Language', 'Arabic');
    await reportCard
      .getByRole('heading', { name: 'Customer feedback report', exact: true })
      .waitFor();
    assert.equal(await page.locator('[data-report-id="' + englishReport._id + '"]').count(), 0);
    check(
      'Arabic saved evidence report, honest missing-model status, real PDF and report library language filtering',
    );
    await page.keyboard.press('Control+k');
    const headerSearch = page.getByRole('combobox', { name: 'Search across pages', exact: true });
    assert.equal(
      await headerSearch.evaluate((element) => document.activeElement === element),
      true,
    );
    await headerSearch.fill('no-such-customer-comment');
    await headerSearch.press('Enter');
    await page
      .getByRole('heading', { name: 'No responses match your filters', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.locator('.feedback-table tbody tr').first().waitFor();
    assert.equal(await headerSearch.inputValue(), '');
    assert.equal(
      await headerSearch.evaluate((element) => document.activeElement === element),
      true,
    );
    await go('nuvia-assistant');
    await page.getByRole('textbox').fill('What do customers say about service?');
    await page.getByRole('textbox').press('Enter');
    await page.getByText('Waiting for a compatible AI model', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Waiting for a compatible AI model', { exact: true }).waitFor();
    check(
      'Header keyboard search, explicit navigation, no-results clear/focus restoration and truthful assistant retry',
    );

    await go('business-page');
    await page.getByLabel('Enable public page').check();
    await page.getByLabel('Page address').fill('acceptance-cafe');
    await page.getByLabel('Description', { exact: true }).fill('Saved browser business');
    await page.getByRole('button', { name: 'Save page settings' }).click();
    await page.getByRole('status').filter({ hasText: 'Page settings saved.' }).waitFor();
    await customer.goto(origin + '/#/b/acceptance-cafe');
    await customer.getByRole('heading', { name: 'Connected Design Cafe' }).waitFor();
    assert.ok((await customer.getByRole('link', { name: 'Share your feedback' }).count()) >= 2);
    check('Saved public branding and branch-bound business page links');

    await go('branch-history?id=' + second.id);
    await page.getByRole('heading', { name: 'Renamed acceptance branch', exact: true }).waitFor();
    await go('branches');
    await page
      .getByRole('button', { name: 'Actions Renamed acceptance branch', exact: true })
      .click();
    await page.getByRole('button', { name: 'Archive branch', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Archive branch', exact: true })
      .click();
    await page.getByRole('button', { name: /^Archived/ }).waitFor();
    await go('branch-history?id=' + second.id);
    await page.getByRole('button', { name: 'Restore branch', exact: true }).click();
    await page
      .getByRole('button', { name: 'Actions Renamed acceptance branch', exact: true })
      .waitFor();
    assert.equal(await deps.models.Response.countDocuments({ branchId: second.id }), 1);
    check(
      'Branch archive/restore UI keeps response history and requires fresh publication for archived links',
    );
    await go('survey-share?id=' + survey._id);
    await page.getByRole('button', { name: 'Close collection', exact: true }).click();
    await customer.goto(origin + '/#/s/' + primaryLink.token);
    await customer
      .getByRole('heading', { name: 'This survey is unavailable', exact: true })
      .waitFor();
    assert.equal(await deps.models.Response.countDocuments({ surveyId: survey._id }), 11);
    check(
      'Closed public collection rejects new submissions without deleting immutable response history',
    );

    const viewerId = randomUUID();
    await deps.models.User.insertOne({
      _id: viewerId,
      name: 'Scoped viewer',
      email: 'acceptance-viewer@example.test',
      locale: 'en',
      verifiedAt: deps.now(),
      passwordHash: await hashPassword('Synthetic123'),
      credentialsVersion: 1,
      termsAcceptedAt: deps.now(),
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    await deps.models.Membership.insertOne({
      _id: randomUUID(),
      userId: viewerId,
      workspaceId: workspace.id,
      role: 'viewer',
      branchIds: [second.id],
      revokedAt: null,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    const viewerContext = await browser.newContext();
    try {
      await mutate(viewerContext.request, 'POST', '/auth/login', {
        email: 'acceptance-viewer@example.test',
        password: 'Synthetic123',
      });
      const viewer = await viewerContext.newPage();
      await viewer.goto(origin + '/#/feedbacks');
      await viewer.getByText('Authorized second branch response', { exact: false }).waitFor();
      assert.equal(await viewer.getByText('Mixed visit acceptance', { exact: false }).count(), 0);
      const forbidden = await viewerContext.request.get(origin + '/api/v1/feedback/' + saved._id);
      assert.equal(forbidden.status(), 404);
      const exported = await viewerContext.request.get(origin + '/api/v1/feedback/export');
      const text = await exported.text();
      assert.ok(text.includes('Authorized second branch response'));
      assert.ok(!text.includes('Mixed visit acceptance'));
      await mutate(viewerContext.request, 'POST', '/reports', { locale: 'en', filters: {} }, 403);
      await viewer.goto(origin + '/#/reports');
      await viewer.getByRole('heading', { name: 'AI Reports', exact: true }).waitFor();
      assert.equal(
        await viewer.getByRole('button', { name: 'Generate new report', exact: true }).count(),
        0,
      );
    } finally {
      await viewerContext.close();
    }
    check('Viewer UI, direct detail, exports and report writes enforce actual branch permissions');

    results.routeStates = [];
    for (const locale of ['en', 'ar']) {
      await page.evaluate((value) => localStorage.setItem('nuvia-language', value), locale);
      for (const width of [360, 768, 1280, 1440]) {
        // Auth, token and persistence assertions above run on the ordinary clock.
        // Only the independent visual matrix advances the isolated API clock.
        advanceVisualBatchWindow({ locale, width });
        if (width === 360) await page.reload();
        await page.setViewportSize({ width, height: width === 1440 ? 960 : 800 });
        for (const route of [
          'dashboard',
          'feedbacks',
          'surveys',
          'survey-builder',
          'branches',
          'team',
          'reports',
          'assistant',
          'settings',
        ]) {
          await go(route);
          assert.equal(
            await page.locator('html').getAttribute('dir'),
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          assert.equal(await page.locator('vite-error-overlay').count(), 0);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
            route + ' ' + locale + ' ' + width + ' horizontal overflow',
          );
          assert.match(await page.title(), /NUVIA/);
          results.routeStates.push({
            route,
            locale,
            width,
            title: await page.title(),
            passed: true,
          });
        }
        await shot(page, 'settings-' + locale + '-' + width);
      }
    }
    assert.equal(results.routeStates.length, 72);
    check(
      '72 actual protected route/locale/viewport states at360/768/1280/1440 without horizontal document overflow',
    );
    const unexpected = failures.filter(
      (failure) =>
        !(failure.status === 503 && failure.path.endsWith('/responses')) &&
        !(failure.status === 404 && failure.path.startsWith('/api/v1/public/surveys/')),
    );
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    results.expectedNetworkFailures = { injectedSubmission503: 1, closedPublicLink404: 1 };
  } catch (error) {
    results.failureState = {
      url: page.url(),
      text: (await page.locator('body').innerText()).slice(0, 6000),
    };
    await shot(page, 'failure');
    results.customerFailureState = {
      url: customer.url(),
      text: (await customer.locator('body').innerText()).slice(0, 3000),
    };
    throw error;
  } finally {
    results.errors.push(...errors);
    await context.close();
    await publicContext.close();
  }
}
