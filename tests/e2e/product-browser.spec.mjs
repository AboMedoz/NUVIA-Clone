import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deliverPendingMail } from '../../apps/api/src/modules/mail/worker.mjs';

// All accounts, answers and mail in this scenario are synthetic and isolated.
export async function runProductBrowserScenario({ browser, origin, deps, output, results }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  });
  const publicContext = await browser.newContext({ viewport: { width: 393, height: 800 } });
  const page = await context.newPage(),
    customer = await publicContext.newPage();
  page.setDefaultTimeout(10000);
  customer.setDefaultTimeout(10000);
  const errors = [];
  let checkingClosedLink = false;
  let injectingSubmissionFailure = false;
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
    });
    target.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !(
          target === customer &&
          injectingSubmissionFailure &&
          message.text().includes('status of 503')
        ) &&
        !(target === customer && checkingClosedLink && message.text().includes('status of 404'))
      )
        errors.push(message.text());
    });
  }
  const check = (message) => results.checks.push(message);
  const screenshot = async (target, name) => {
    await target.evaluate(() => scrollTo(0, 0));
    await target.screenshot({ path: join(output, name + '.png'), fullPage: false });
    results.screenshots.push(name + '.png');
  };
  const go = async (route) => {
    await page.goto(origin + '/#/' + route);
    await page.locator('.connected-product h1').waitFor();
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('.connected-product [role="status"]')).some((node) =>
          /^(Loading…|جارٍ التحميل…)$/.test(node.textContent.trim()),
        ),
    );
    assert.match(await page.title(), /NUVIA/i);
  };
  try {
    await page.goto(origin + '/#/signup');
    await page.getByLabel('Full name').fill('Synthetic Product Owner');
    await page.getByLabel('Work email').fill('product-browser@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await page.getByLabel('Confirm password').fill('Synthetic123');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: 'Verify your email' }).waitFor();
    await deliverPendingMail(deps);
    const names = await readdir(deps.config.mailDirectory);
    const messages = await Promise.all(
      names.map(async (name) =>
        JSON.parse(await readFile(join(deps.config.mailDirectory, name), 'utf8')),
      ),
    );
    const verification = messages
      .flatMap((mail) => mail.text.split('\n'))
      .find((line) => line.startsWith(origin) && line.includes('verify-email'));
    assert.ok(verification);
    await page.goto(verification);
    await page.getByText('Email verified. You can log in now.').waitFor();
    await page.getByRole('link', { name: 'Back to log in' }).click();
    await page.getByLabel('Work email').fill('product-browser@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByLabel(/Business name/).fill('Product Browser Cafe');
    await page.getByLabel(/Business type/).fill('Cafe');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel(/Primary branch name/).fill('Cairo');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Get Started', exact: true }).click();
    await page.getByRole('heading', { name: 'No responses yet' }).waitFor();
    check('F-PLT-01: browser signup, local file-mail verification, login and workspace setup');
    await screenshot(page, 'overview-empty-desktop');

    await go('branches');
    await page.getByRole('button', { name: 'Add branch', exact: true }).click();
    await page.getByLabel('Branch name', { exact: true }).fill('Giza');
    await page.getByRole('button', { name: 'Create branch', exact: true }).click();
    await page.getByRole('cell', { name: 'Giza', exact: true }).waitFor();
    const branchRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Giza', exact: true }) });
    await branchRow.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Branch name: Giza').fill('Giza branch');
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    await page.getByRole('button', { name: 'Save name', exact: true }).waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByRole('cell', { name: 'Giza branch', exact: true }).waitFor();
    check('F-PLT-03: created and renamed branch through UI');

    await go('survey-builder');
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Add a survey title' }).waitFor();
    await page.getByLabel('Survey title').fill('Six-type experience');
    await screenshot(page, 'wizard-details-en-desktop');
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    const definitions = [
      ['short_text', 'Visit summary'],
      ['long_text', 'Service details'],
      ['single_choice', 'Visit type'],
      ['multiple_choice', 'Items tried'],
      ['rating', 'Overall rating'],
      ['nps', 'Recommend us'],
    ];
    for (let index = 0; index < definitions.length; index++) {
      if (index) await page.getByRole('button', { name: 'Add question', exact: true }).click();
      const question = page.locator('.product-question').nth(index);
      await page.getByLabel('Answer type').selectOption(definitions[index][0]);
      await question
        .getByLabel('Question ' + (index + 1), { exact: true })
        .fill(definitions[index][1]);
      if (index === 2 || index === 3)
        await page
          .getByLabel('Options (one per line)')
          .fill(index === 2 ? 'Dine in\nTakeaway' : 'Coffee\nPastry');
      if (index === 2) await page.getByLabel('Use answers as a customer segment').check();
    }
    await page
      .locator('.product-question')
      .nth(1)
      .getByRole('button', { name: 'Edit question 2', exact: true })
      .click();
    await page
      .locator('.product-question')
      .nth(1)
      .getByRole('button', { name: 'Move up', exact: true })
      .click();
    assert.equal(
      await page
        .locator('.product-question')
        .first()
        .getByLabel('Question 1', { exact: true })
        .inputValue(),
      'Service details',
    );
    await page.getByRole('button', { name: 'Back to details', exact: true }).click();
    assert.equal(await page.getByLabel('Survey title').inputValue(), 'Six-type experience');
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    assert.equal(await page.locator('.product-question').count(), 6);
    assert.equal(
      await page
        .locator('.product-question')
        .first()
        .getByLabel('Question 1', { exact: true })
        .inputValue(),
      'Service details',
    );
    await page
      .locator('.product-question')
      .nth(1)
      .getByRole('button', { name: 'Edit question 2', exact: true })
      .click();
    await page
      .locator('.product-question')
      .nth(1)
      .getByRole('button', { name: 'Move up', exact: true })
      .click();
    assert.equal(
      await page
        .locator('.product-question')
        .first()
        .getByLabel('Question 1', { exact: true })
        .inputValue(),
      'Visit summary',
    );
    const beforePreview = results.requests.filter((request) => request.method !== 'GET').length;
    await page.getByRole('button', { name: 'Preview on mobile', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Mobile preview', exact: true });
    await preview.waitFor();
    await page.waitForFunction(() => {
      const heading = document.querySelector('.wizard-preview h2');
      const rect = heading?.getBoundingClientRect();
      return rect && rect.top >= 76 && rect.bottom <= innerHeight;
    });
    assert.equal(await preview.locator('.wizard-preview-question').count(), 6);
    assert.ok(
      await preview
        .locator('input,select,textarea')
        .evaluateAll((fields) => fields.every((field) => field.matches(':disabled'))),
    );
    assert.equal(
      results.requests.filter((request) => request.method !== 'GET').length,
      beforePreview,
    );
    await preview.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => scrollBy(0, -100));
    assert.ok(
      await preview.evaluate((element) => element.getBoundingClientRect().top < innerHeight),
    );
    await preview.screenshot({ path: join(output, 'wizard-preview-en-desktop.png') });
    results.screenshots.push('wizard-preview-en-desktop.png');
    await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
    assert.equal(
      await page
        .getByRole('button', { name: 'Preview on mobile', exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
    );
    await screenshot(page, 'wizard-questions-en-desktop');
    await page.getByRole('button', { name: 'Continue to sharing', exact: true }).click();
    await page.getByRole('button', { name: 'Back to questions', exact: true }).click();
    assert.equal(await page.locator('.product-question').count(), 6);
    const editedQuestion = page
      .locator('.product-question')
      .first()
      .getByLabel('Question 1', { exact: true });
    await editedQuestion.fill('Visit summary while reviewing');
    await page.getByRole('button', { name: 'Language / اللغة', exact: true }).click();
    await page.getByRole('option', { name: /العربية/ }).click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(
      await page
        .locator('.product-question')
        .first()
        .locator('input[id^="question-"]')
        .inputValue(),
      'Visit summary while reviewing',
    );
    await page.getByRole('button', { name: 'Language / اللغة', exact: true }).click();
    await page.getByRole('option', { name: /English/ }).click();
    assert.equal(await editedQuestion.inputValue(), 'Visit summary while reviewing');
    await editedQuestion.fill('Visit summary');
    await page.getByRole('button', { name: 'Continue to sharing', exact: true }).click();
    assert.equal(
      results.requests.filter(
        (request) => request.method === 'POST' && request.path === '/api/v1/surveys',
      ).length,
      1,
      'Returning from sharing updates the saved survey instead of duplicating it',
    );
    await screenshot(page, 'wizard-sharing-en-desktop');
    await page.getByLabel('Cairo', { exact: true }).check();
    await page.getByLabel('Giza branch', { exact: true }).check();
    await page.getByRole('button', { name: 'Publish survey', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Survey published' }).waitFor();
    const links = [
      ...new Set(
        await page
          .locator('a[target="_blank"][href*="#/s/"]')
          .evaluateAll((items) => items.map((item) => item.href)),
      ),
    ];
    assert.equal(links.length, 2);
    await page.getByRole('img', { name: 'Survey link QR code' }).first().waitFor();
    const qrDownload = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download QR PNG' }).first().click();
    assert.equal((await qrDownload).suggestedFilename(), 'nuvia-survey-qr.png');
    check('F-COL-01/03/04/07: six question types, segment, two branch links and downloaded QR PNG');
    await screenshot(page, 'surveys-published-desktop');

    await customer.goto(links[0]);
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    assert.equal(await customer.getByRole('alert').count(), 7);
    await customer.getByLabel('Visit summary', { exact: true }).fill('Mixed visit');
    await customer
      .getByLabel('Service details', { exact: true })
      .fill('القهوة ممتازة لكن الخدمة بطيئة. Friendly staff.');
    await customer.getByLabel('Dine in', { exact: true }).check();
    await customer.getByLabel('Coffee', { exact: true }).check();
    await customer.getByLabel('Overall rating', { exact: true }).selectOption('3');
    await customer.getByLabel('Recommend us', { exact: true }).selectOption('0');
    await customer.getByLabel(/I agree/).check();
    assert.equal(
      await customer.getByRole('alert').count(),
      0,
      'Correcting valid answers clears old errors',
    );
    let attempts = 0;
    const requests = [];
    await customer.route('**/api/v1/public/surveys/*/responses', async (route) => {
      requests.push(route.request().postDataJSON());
      if (attempts++ === 0)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        });
      return route.continue();
    });
    injectingSubmissionFailure = true;
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await customer.getByRole('alert').filter({ hasText: 'Could not complete' }).waitFor();
    injectingSubmissionFailure = false;
    assert.equal(await customer.getByLabel('Visit summary').inputValue(), 'Mixed visit');
    await customer.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await customer.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
    assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
    check(
      'F-COL-06: required validation clears after correction, failed request retains answers/idempotency key, retry saves once',
    );
    await screenshot(customer, 'public-confirmation-mobile');

    await go('feedbacks');
    await page.getByRole('link', { name: /Mixed visit/ }).waitFor();
    assert.equal(await page.locator('.product-navigation [data-name="Unread count"]').count(), 0);
    const responseHref = await page.getByRole('link', { name: /Mixed visit/ }).getAttribute('href');
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
    const csv = await csvDownload;
    assert.ok((await readFile(await csv.path(), 'utf8')).includes('Mixed visit'));
    await page.getByText('More filters', { exact: true }).click();
    await page
      .getByRole('combobox', { name: /^Customer segment/ })
      .selectOption({ label: 'Six-type experience · Visit type' });
    await page.getByLabel('Segment value', { exact: true }).fill('Takeaway');
    await page.getByText('No responses match your filters').waitFor();
    await page.getByLabel('Segment value', { exact: true }).fill('Dine in');
    await page.getByRole('link', { name: /Mixed visit/ }).waitFor();
    await page.getByRole('link', { name: /Mixed visit/ }).click();
    await page.getByRole('heading', { name: 'Feedback details', exact: true }).waitFor();
    await page.getByText('Recommend us', { exact: true }).waitFor();
    check('F-DSH-07/08: saved feedback, actual CSV download, segment filter and six-answer detail');

    await go('surveys');
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    await page.getByLabel('Question 1', { exact: true }).fill('Updated summary');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('heading', { name: 'Manage surveys', exact: true }).waitFor();
    await customer.goto(links[0]);
    // The same hash URL is a same-document navigation; reload to begin a fresh visit.
    await customer.reload();
    await customer.getByLabel('Visit summary', { exact: true }).waitFor();
    assert.equal(await customer.getByLabel('Updated summary', { exact: true }).count(), 0);
    await page.goto(origin + '/' + responseHref);
    await page.getByText('Visit summary', { exact: true }).waitFor();
    check(
      'F-COL-01: editing a published draft preserves existing public questions and saved answer history',
    );

    await go('settings');
    await page.getByLabel('Enable public page').check();
    await page.getByLabel('Page address').fill('browser-cafe');
    await page.getByLabel('Description', { exact: true }).fill('Synthetic browser cafe');
    await page.getByRole('button', { name: 'Save page settings' }).click();
    await page.getByRole('status').filter({ hasText: 'Page settings saved.' }).waitFor();
    await customer.goto(origin + '/#/b/browser-cafe');
    await customer.getByRole('heading', { name: 'Product Browser Cafe' }).waitFor();
    assert.equal(await customer.getByRole('link', { name: 'Share your feedback' }).count(), 2);
    check('F-COL-05: public branding settings persist and anonymous page lists branch surveys');

    await go('reports');
    await page.getByRole('button', { name: 'Generate new report', exact: true }).click();
    await page.getByRole('combobox', { name: /^Report language/ }).selectOption('ar');
    await page.getByRole('button', { name: 'Create report', exact: true }).click();
    await page
      .locator('.selected-report')
      .getByText('Waiting for model', { exact: true })
      .waitFor();
    await page.locator('.selected-report q').filter({ hasText: 'Mixed visit' }).waitFor();
    const pdfDownload = page.waitForEvent('download');
    await page
      .locator('.selected-report')
      .getByRole('link', { name: 'Download PDF', exact: true })
      .click();
    const pdf = await pdfDownload;
    const pdfBytes = await readFile(await pdf.path());
    assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
    await pdf.saveAs(join(output, 'report-ar.pdf'));
    await page.locator('.report-library-toolbar select').first().selectOption('en');
    await page.getByText('No reports match this language', { exact: true }).waitFor();
    await page.locator('.report-library-toolbar select').first().selectOption('');
    await page.getByRole('button', { name: 'Open report', exact: true }).waitFor();
    check(
      'F-LLM-01/02/DSH-08: Arabic saved report preserves source, honest missing-model state, PDF download and language filtering',
    );
    await page.keyboard.press('Control+k');
    const headerSearch = page.getByRole('textbox', { name: 'Search feedback…', exact: true });
    assert.equal(
      await headerSearch.evaluate((element) => document.activeElement === element),
      true,
    );
    await headerSearch.fill('no-such-customer-comment');
    await headerSearch.press('Enter');
    await page.getByText('No responses match your filters', { exact: true }).waitFor();
    assert.ok(page.url().includes('#/feedbacks'));
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.getByRole('link', { name: /Mixed visit/ }).waitFor();
    assert.equal(await headerSearch.inputValue(), '');
    assert.equal(
      await headerSearch.evaluate((element) => document.activeElement === element),
      true,
    );
    check(
      'Header feedback search shortcut, Enter navigation, filtered no-results and clear/focus restoration',
    );

    await go('assistant');
    await page
      .getByRole('textbox', { name: /^Your question/ })
      .fill('What do customers say about service?');
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).click();
    await page.getByText('A compatible model is not available yet.', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: /^Your question/ }).inputValue(),
      'What do customers say about service?',
    );
    check(
      'F-LLM-03: assistant preserves question and distinguishes missing model from successful generated content',
    );

    await go('branches');
    const giza = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Giza branch', exact: true }) });
    await giza.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: /^Archived ·/ }).click();
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Giza branch', exact: true }) })
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.getByRole('button', { name: /^Active branches ·/ }).click();
    await page.getByRole('cell', { name: 'Giza branch', exact: true }).waitFor();
    check('F-PLT-03: archived and restored branch through UI without deleting saved feedback');

    await go('surveys');
    await page.getByRole('button', { name: 'Share & manage', exact: true }).click();
    await page.getByRole('button', { name: 'Close collection', exact: true }).click();
    await page
      .getByText('Collection closed. Existing responses are preserved.', { exact: true })
      .waitFor();
    checkingClosedLink = true;
    await customer.goto(links[1]);
    await customer
      .getByRole('heading', { name: 'This survey is unavailable', exact: true })
      .waitFor();
    await go('feedbacks');
    await page.getByRole('link', { name: /Mixed visit/ }).waitFor();
    check(
      'F-COL-03/06: closed public link rejects new collection while prior response remains visible',
    );

    await go('survey-builder');
    await page.locator('.survey-templates button').first().click();
    assert.ok((await page.getByLabel('Survey title').inputValue()).length);
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    assert.ok((await page.locator('.product-question').count()) > 1);
    check('F-COL-02: editable template imports real questions');

    await page.evaluate(() => localStorage.setItem('nuvia-language', 'ar'));
    await page.reload();
    await go('team');
    const mutationCount = () =>
      results.requests.filter((request) => !['GET', 'HEAD'].includes(request.method)).length;
    const beforeInvalidTeam = mutationCount();
    await page.locator('input[type="email"]').fill('not-an-email');
    await page.getByRole('checkbox', { name: 'Cairo', exact: true }).check();
    await page.getByRole('button', { name: 'إنشاء دعوة', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'أدخل بريدًا إلكترونيًا صالحًا.' }).waitFor();
    assert.equal(
      await page
        .locator('input[type="email"]')
        .evaluate((element) => document.activeElement === element),
      true,
    );
    assert.equal(mutationCount(), beforeInvalidTeam);
    await go('settings');
    const beforeInvalidSettings = mutationCount();
    await page.locator('[name="slug"]').fill('Bad Slug');
    await page.getByRole('button', { name: 'حفظ إعدادات الصفحة', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'استخدم من ٣ إلى ٨٠' }).waitFor();
    assert.equal(
      await page.locator('[name="slug"]').evaluate((element) => document.activeElement === element),
      true,
    );
    await page.locator('[name="slug"]').fill('browser-cafe');
    await page.locator('[name="logoUrl"]').fill('http://example.test/logo.png');
    await page.getByRole('button', { name: 'حفظ إعدادات الصفحة', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'أدخل رابط HTTPS' }).waitFor();
    assert.equal(
      await page
        .locator('[name="logoUrl"]')
        .evaluate((element) => document.activeElement === element),
      true,
    );
    assert.equal(mutationCount(), beforeInvalidSettings);
    await page.locator('[name="description"]').fill('وصف طويل قابل للتحرير.\n'.repeat(50));
    assert.ok(
      await page
        .locator('[name="description"]')
        .evaluate(
          (element) =>
            getComputedStyle(element).resize === 'none' &&
            element.clientHeight >= element.scrollHeight - 2,
        ),
    );
    check(
      'Arabic invalid email/slug/HTTPS forms show localized errors, focus first invalid field and send no writes; long textarea grows naturally',
    );
    await page.goto(origin + '/#/verify-email');
    const beforeInvalidResend = mutationCount();
    await page.locator('input[name="verification-email"]').fill('invalid-email');
    await page.getByRole('button', { name: 'إعادة إرسال رابط التأكيد', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'أدخل بريدًا إلكترونيًا صالحًا.' }).waitFor();
    assert.equal(
      await page
        .locator('input[name="verification-email"]')
        .evaluate((element) => document.activeElement === element),
      true,
    );
    assert.equal(mutationCount(), beforeInvalidResend);
    check(
      'Arabic verification resend rejects invalid email locally, retains value and focuses field',
    );

    const pageTitles = {
      dashboard: ['Overview', 'نظرة عامة'],
      feedbacks: ['Feedback', 'الردود'],
      surveys: ['Surveys', 'الاستبيانات'],
      'survey-builder': ['Survey builder', 'إنشاء استبيان'],
      branches: ['Branches', 'الفروع'],
      team: ['Business and team', 'النشاط والفريق'],
      reports: ['Reports', 'التقارير'],
      assistant: ['Assistant', 'المساعد'],
      settings: ['Business settings', 'إعدادات النشاط'],
    };
    results.routeStates = [];
    for (const locale of ['en', 'ar']) {
      await page.evaluate((value) => localStorage.setItem('nuvia-language', value), locale);
      await page.reload();
      for (const width of [360, 768, 1280, 1440]) {
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
          await page.locator('.connected-product').waitFor();
          await page.waitForTimeout(100);
          assert.equal(
            await page.locator('html').getAttribute('dir'),
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${route} ${locale} ${width} horizontal overflow`,
          );
          assert.equal(await page.locator('vite-error-overlay').count(), 0);
          assert.equal(await page.title(), 'NUVIA — ' + pageTitles[route][locale === 'ar' ? 1 : 0]);
          assert.notEqual(
            await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth),
            'none',
          );
          results.routeStates.push({
            route,
            locale,
            width,
            title: await page.title(),
            passed: true,
          });
          if ((locale === 'en' && width === 1440) || (locale === 'ar' && width === 360))
            await screenshot(page, route + '-' + locale + '-' + width);
        }
      }
    }
    check(
      'F-PLT-04: nine product routes at 360/768/1280/1440 in EN/AR, correct direction, visible scrollbars and no page overflow',
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await go('survey-builder');
    await page.locator('.survey-templates button').nth(1).click();
    const arabicTitle = await page.getByLabel('عنوان الاستبيان', { exact: true }).inputValue();
    assert.ok(arabicTitle.length);
    await screenshot(page, 'wizard-details-ar-mobile');
    await page.getByRole('button', { name: 'المتابعة للأسئلة', exact: true }).click();
    const arabicQuestions = await page.locator('.product-question').count();
    assert.ok(arabicQuestions > 1);
    await screenshot(page, 'wizard-questions-ar-mobile');
    await page.getByRole('button', { name: 'معاينة على الهاتف', exact: true }).click();
    await page.getByRole('region', { name: 'معاينة الهاتف', exact: true }).waitFor();
    await page.getByRole('button', { name: 'إغلاق المعاينة', exact: true }).click();
    await page.getByRole('button', { name: 'العودة للتفاصيل', exact: true }).click();
    assert.equal(
      await page.getByLabel('عنوان الاستبيان', { exact: true }).inputValue(),
      arabicTitle,
    );
    await page.getByRole('button', { name: 'المتابعة للأسئلة', exact: true }).click();
    assert.equal(await page.locator('.product-question').count(), arabicQuestions);
    await page.getByRole('button', { name: 'المتابعة للمشاركة', exact: true }).click();
    await page.getByRole('heading', { name: 'مشاركة الاستبيان', exact: true }).waitFor();
    await screenshot(page, 'wizard-sharing-ar-mobile');
    check(
      'F-COL-01: real three-step wizard, reorder and backward draft retention, read-only mobile preview, repeated save without duplication, Arabic narrow template-to-sharing journey',
    );
    await page.setViewportSize({ width: 393, height: 800 });
    await page.getByRole('button', { name: 'قائمة التنقل', exact: true }).click();
    assert.equal(
      await page
        .getByRole('button', { name: 'قائمة التنقل', exact: true })
        .getAttribute('aria-expanded'),
      'true',
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page
        .getByRole('button', { name: 'قائمة التنقل', exact: true })
        .getAttribute('aria-expanded'),
      'false',
    );
    check('Mobile navigation opens and Escape closes it');
    const failedResponses = results.requests.filter((request) => request.status >= 400);
    const injectedFailures = failedResponses.filter(
      (request) =>
        request.method === 'POST' &&
        request.path === '/api/v1/public/surveys/:token/responses' &&
        request.status === 503,
    );
    const closedFailures = failedResponses.filter(
      (request) =>
        request.method === 'GET' &&
        request.path === '/api/v1/public/surveys/:token' &&
        request.status === 404,
    );
    assert.equal(
      injectedFailures.length,
      1,
      'Only the one injected submission failure is expected',
    );
    assert.equal(closedFailures.length, 1, 'Only the deliberately closed public link is expected');
    assert.equal(
      failedResponses.length,
      2,
      'No other API failure is accepted by the browser scenario',
    );
    results.expectedNetworkFailures = { injectedSubmission503: 1, closedPublicLink404: 1 };
    assert.deepEqual(errors, []);
  } catch (error) {
    results.customerFailureState = {
      url: customer.url(),
      text: (await customer.locator('body').innerText()).slice(0, 4000),
    };
    await screenshot(customer, 'customer-failure');
    results.failureState = {
      url: page.url(),
      text: (await page.locator('body').innerText()).slice(0, 6000),
    };
    await screenshot(page, 'failure');
    throw error;
  } finally {
    results.errors.push(...errors);
    await context.close();
    await publicContext.close();
  }
}
