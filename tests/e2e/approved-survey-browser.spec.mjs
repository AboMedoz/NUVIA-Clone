import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { hashPassword } from '../../apps/api/src/modules/auth/passwords.mjs';
import { saveWorkspace, completeSetup } from '../../apps/api/src/modules/workspaces/service.mjs';
export async function runProductBrowserScenario({ browser, origin, deps, output, results }) {
  const userId = randomUUID();
  await deps.models.User.insertOne({
    _id: userId,
    name: 'Approved UI Owner',
    email: 'approved-ui@example.test',
    locale: 'en',
    verifiedAt: deps.now(),
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
  });
  await saveWorkspace(
    userId,
    {
      businessName: 'Connected Design Cafe',
      industry: 'Cafe',
      locale: 'en',
      reportingTimezone: 'Africa/Cairo',
    },
    deps,
  );
  const workspace = await completeSetup(
    userId,
    { branchType: 'multiple', branchName: 'Saved Main Branch' },
    deps,
  );
  const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: 'reduce',
    }),
    publicContext = await browser.newContext({
      viewport: { width: 393, height: 800 },
      reducedMotion: 'reduce',
    });
  const page = await context.newPage(),
    customer = await publicContext.newPage();
  page.setDefaultTimeout(15000);
  customer.setDefaultTimeout(15000);
  for (const target of [page, customer]) {
    target.on('pageerror', (error) => results.errors.push(error.message));
    target.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/'))
        results.requests.push({
          path: url.pathname.replace(/(\/public\/surveys\/)[^/]+/, '$1:token'),
          method: response.request().method(),
          status: response.status(),
        });
    });
  }
  const shot = async (target, name) => {
    await target.evaluate(() => scrollTo(0, 0));
    await target.screenshot({ path: join(output, name + '.png'), fullPage: false });
    results.screenshots.push(name + '.png');
  };
  try {
    await page.goto(origin + '/#/login');
    await page.getByLabel('Work email').fill('approved-ui@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL('**/#/dashboard');
    await page.goto(origin + '/#/survey-create');
    await page.locator('[data-node-id="262:12005"]').click();
    assert.equal(new URL(page.url()).hash, '#/survey-create');
    await page.locator('.survey-toast').filter({ hasText: 'Add a survey name.' }).waitFor();
    await page.getByLabel('Survey title', { exact: true }).fill('Approved survey journey');
    assert.equal(
      await page.locator('.survey-toast').filter({ hasText: 'Add a survey name.' }).count(),
      0,
    );
    assert.match(
      await page.locator('[data-node-id="259:4715"]').textContent(),
      /1 branches selected/,
    );
    await page.locator('[data-node-id="262:12005"]').click();
    await page.waitForURL('**/#/survey-ai');
    await page
      .getByRole('textbox', { name: 'Survey goal', exact: true })
      .last()
      .fill('Understand service quality');
    await page.getByRole('button', { name: 'Generate Questions', exact: true }).click();
    await page
      .locator('.survey-toast')
      .filter({ hasText: 'Survey generation is waiting for a compatible AI model.' })
      .waitFor();
    assert.equal(new URL(page.url()).hash, '#/survey-ai');
    results.checks.push(
      'AI entry validates the name, opens the goal screen and preserves an honest unavailable-model state',
    );
    await page.evaluate(() => {
      location.hash = '/survey-create';
    });
    await page.getByLabel('Survey title', { exact: true }).waitFor();
    await page.getByLabel('Description', { exact: true }).fill('Your saved survey introduction');
    await page.getByRole('switch', { name: 'Collect feedback anonymously' }).click();
    await page.getByRole('button', { name: 'Continue to questions' }).click();
    await page.waitForURL('**/#/survey-questions');
    await page.getByRole('button', { name: 'Delete question', exact: true }).click();
    await page.getByText('No questions yet', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add question', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Question text', exact: true })
      .pressSequentially('How was your visit?');
    assert.equal(
      await page.getByRole('textbox', { name: 'Question text', exact: true }).inputValue(),
      'How was your visit?',
    );
    results.checks.push(
      'Continuous real-browser typing retains focus; deleting the last draft question and adding one works',
    );
    await page.getByRole('button', { name: 'Add question', exact: true }).click();
    await page.getByRole('textbox', { name: 'Question text', exact: true }).fill('What went well?');
    await page.getByLabel('Question type', { exact: true }).click();
    await page.getByRole('option', { name: 'Long text', exact: true }).click();
    await page.getByRole('button', { name: 'Question order', exact: true }).click();
    await page.getByRole('option', { name: 'Move up', exact: true }).click();
    await shot(page, 'survey-editor-desktop-en');
    await page.setViewportSize({ width: 393, height: 800 });
    await shot(page, 'survey-editor-narrow-en');
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('button', { name: 'Continue to sharing' }).click();
    await page.waitForURL('**/#/survey-share?id=*');
    const survey = await deps.models.Survey.findOne({
      workspaceId: workspace.id,
      title: 'Approved survey journey',
    }).lean();
    assert.ok(survey);
    assert.equal(survey.questions[0].label, 'What went well?');
    assert.equal(survey.questions[1].label, 'How was your visit?');
    assert.equal(survey.anonymous, false);
    assert.deepEqual(survey.enabledLanguages, ['en', 'ar']);
    results.checks.push(
      'Privacy and languages persist, and the grip menu reorders stable question identities',
    );
    assert.equal(survey.status, 'draft');
    results.checks.push(
      'Approved details/question screens save a real draft before sharing without publishing',
    );
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().endsWith('/publish') && response.status() === 200,
      ),
      page.getByRole('button', { name: 'Publish survey', exact: true }).click(),
    ]);
    const link = await deps.models.SurveyLink.findOne({
      surveyId: survey._id,
      enabled: true,
    }).lean();
    assert.ok(link);
    await page.locator('[data-name="Survey QR code"] img').waitFor();
    const qr = await page.locator('[data-name="Survey QR code"] img').getAttribute('src');
    assert.match(qr, /^data:image\/png/);
    assert.equal(await page.getByText('nuvia.link/bloom-feedback', { exact: false }).count(), 0);
    await shot(page, 'survey-sharing-desktop-en');
    results.checks.push(
      'Explicit publication creates a branch-bound public link and local QR from the real URL',
    );
    await customer.goto(origin + '/#/s/' + link.token);
    await customer.getByRole('radio', { name: '5', exact: true }).waitFor();
    assert.equal(await deps.models.SurveyStart.countDocuments({ surveyId: survey._id }), 0);
    await customer
      .getByRole('textbox', { name: 'What went well?', exact: true })
      .fill('Saved public response from approved UI');
    await customer.getByRole('radio', { name: '5', exact: true }).click();
    await customer.getByLabel('Name', { exact: true }).fill('Synthetic Customer');
    await customer.getByLabel('Email', { exact: true }).fill('synthetic-customer@example.test');
    await customer.getByRole('checkbox').check();
    await shot(customer, 'public-survey-narrow-en');
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await customer.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
    assert.equal(
      await deps.models.Response.countDocuments({
        surveyId: survey._id,
        branchId: workspace.primaryBranchId,
      }),
      1,
    );
    const savedResponse = await deps.models.Response.findOne({ surveyId: survey._id }).lean();
    assert.equal(savedResponse.respondent.name, 'Synthetic Customer');
    assert.equal(savedResponse.sourceChannel, 'link');
    assert.equal(await deps.models.SurveyStart.countDocuments({ surveyId: survey._id }), 1);
    assert.equal(
      await deps.models.SurveyStart.countDocuments({
        surveyId: survey._id,
        completedAt: { $ne: null },
      }),
      1,
    );
    results.checks.push(
      'Only first form interaction starts a session; successful submission completes it atomically',
    );
    results.checks.push(
      'Supplied public survey saves a validated response with explicitly allowed optional contact to its immutable branch revision',
    );
    await customer.getByRole('button', { name: 'Switch to Arabic' }).click();
    await shot(customer, 'public-survey-success-narrow-ar');
    await page.goto(origin + '/#/survey-all');
    // Begin the navigation-cache assertion with a fresh session read after
    // the independent customer browser has submitted its response.
    await page.reload();
    await page.getByText('Approved survey journey', { exact: true }).waitFor();
    assert.equal(await page.getByText('Customer experience survey', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Quick satisfaction check', { exact: true }).count(), 0);
    await shot(page, 'survey-list-desktop-en');
    await page.bringToFront();
    await page
      .locator('[data-name="Unread count"]')
      .filter({ hasText: /^\s*1\s*$/ })
      .waitFor({ timeout: 35000 });
    assert.equal(await page.locator('[data-name="Unread notification indicator"]').count(), 1);
    const surveyReads = () =>
      results.requests.filter(
        (request) => request.path === '/api/v1/surveys' && request.method === 'GET',
      ).length;
    await page.evaluate(() => {
      location.hash = '/feedbacks';
    });
    await page.getByRole('heading', { name: 'Feedbacks', exact: true }).waitFor();
    // The first visit may reuse a fresh result or revalidate an older one.
    // Measure the subsequent navigation after either read has settled.
    await page.waitForLoadState('networkidle');
    const beforeReads = surveyReads();
    await page.evaluate(() => {
      location.hash = '/survey-all';
    });
    await page.getByText('Approved survey journey', { exact: true }).waitFor();
    assert.equal(surveyReads(), beforeReads);
    results.checks.push(
      'Unread feedback badge and notification dot reflect the saved submission; hash navigation reuses survey GET data',
    );
    await page.locator('[data-workspace-search]').fill('Saved public response');
    await page.getByRole('option', { name: /Saved public response from approved UI/ }).waitFor();
    await shot(page, 'workspace-search-real-results');
    await page.getByRole('option', { name: /Saved public response from approved UI/ }).click();
    await page.waitForURL('**/#/feedback-details?id=' + savedResponse._id);
    results.checks.push('Global header search finds saved feedback and opens its real UUID');
    await page.goto(origin + '/#/survey-all');
    await page.getByText('Approved survey journey', { exact: true }).waitFor();
    await page.evaluate(() => {
      location.hash = '/dashboard';
    });
    await page.getByRole('heading', { name: 'AI Daily Insight', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Generate insights', exact: true }).first().click();
    await page
      .getByText('A compatible model is not available yet.', { exact: true })
      .first()
      .waitFor();
    assert.equal(await deps.models.Report.countDocuments({ workspaceId: workspace.id }), 1);
    await shot(page, 'overview-insights-desktop-en');
    await page
      .locator('[data-name="Prioritized actions"]')
      .screenshot({ path: join(output, 'overview-next-steps-desktop-en.png') });
    results.screenshots.push('overview-next-steps-desktop-en.png');
    results.checks.push(
      'Overview cards generate a scoped persisted report and display unavailable AI honestly without sample results',
    );
    await page.evaluate(() => {
      location.hash = '/survey-all';
    });
    await page.getByText('Approved survey journey', { exact: true }).waitFor();
    await page.setViewportSize({ width: 393, height: 800 });
    await page.evaluate(() => localStorage.setItem('nuvia-language', 'ar'));
    await page.reload();
    await page.getByText('Approved survey journey', { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await shot(page, 'survey-list-narrow-ar');
    results.checks.push(
      'Approved survey list is sample-free and renders saved survey at desktop EN and narrow AR',
    );
    await page.evaluate((id) => {
      location.hash = '/survey-questions?id=' + id;
    }, survey._id);
    const arabicQuestion = page.locator('[data-node-id="262:10808"] input');
    await arabicQuestion.waitFor();
    await arabicQuestion.fill('');
    await arabicQuestion.pressSequentially('كيف كانت الخدمة؟');
    assert.equal(await arabicQuestion.inputValue(), 'كيف كانت الخدمة؟');
    await shot(page, 'survey-editor-narrow-ar');
    await page.evaluate(() => {
      location.hash = '/dashboard';
    });
    await page
      .getByRole('heading', { name: 'رؤية الذكاء الاصطناعي اليومية', exact: true })
      .waitFor();
    await shot(page, 'overview-insights-narrow-ar');
    await page.setViewportSize({ width: 1440, height: 960 });
    await shot(page, 'overview-insights-desktop-ar');
    await page.setViewportSize({ width: 393, height: 800 });
    results.checks.push(
      'Survey editor and overview render at desktop/narrow EN/AR; continuous Arabic question typing retains focus',
    );
    await page.goto(origin + '/#/feedbacks');
    await page.locator('.product-page').waitFor();
    await shot(page, 'feedback-narrow-ar');
    await page.goto(origin + '/#/analytics-sentiment');
    await page.locator('.product-page').waitFor();
    await shot(page, 'analytics-narrow-ar');
    assert.equal(results.errors.length, 0, results.errors.join('\n'));
  } catch (error) {
    await shot(page, 'failure-state').catch(() => {});
    results.failureState = await page
      .locator('body')
      .innerText()
      .catch(() => 'Page unavailable');
    throw error;
  } finally {
    await publicContext.close();
    await context.close();
  }
}
