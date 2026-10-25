import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5191';
const output = path.resolve('../../.superpowers/sdd/nuvia-completion/frontend-qa');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(origin + '/#/login');
  await page.getByLabel('Work email', { exact: true }).fill('qa-owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/#/dashboard');
  if (!process.env.QA_SWEEP_ONLY) {
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Surveys', exact: true })
      .click();
    await page.getByRole('link', { name: 'Create survey', exact: true }).click();
    await page.getByLabel('Survey title', { exact: true }).fill('Browser acceptance survey');
    await page.getByLabel('Question 1', { exact: true }).fill('How was your visit?');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.waitForURL('**/#/surveys?selected=*');
    await page.getByLabel('Cairo', { exact: true }).check();
    await page.getByRole('button', { name: 'Publish survey', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Survey published' }).waitFor();
    const publicUrl = await page
      .locator('.product-share a[target="_blank"]')
      .first()
      .getAttribute('href');
    assert.ok(publicUrl);
    await page.locator('.product-qr').waitFor();
    await page.screenshot({ path: path.join(output, 'published-en-1280.png'), fullPage: true });
    const publicPage = await context.newPage();
    publicPage.on('pageerror', (error) => errors.push(error.message));
    await publicPage.goto(publicUrl.replace(new URL(publicUrl).origin, origin));
    await publicPage
      .getByLabel('How was your visit?', { exact: true })
      .fill('The team was helpful, but we waited too long.');
    await publicPage.getByLabel('I agree to share these answers with this business.').check();
    await publicPage.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await publicPage.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
    await publicPage.screenshot({
      path: path.join(output, 'public-confirmation-en-1280.png'),
      fullPage: true,
    });
    checks.push(
      'Created/persisted/published survey; local QR rendered; public submitted and confirmed',
    );
    await page.goto(origin + '/#/feedbacks');
    await page
      .getByRole('link', { name: 'The team was helpful, but we waited too long.', exact: true })
      .first()
      .waitFor();
    await page.reload();
    await page
      .getByRole('link', { name: 'The team was helpful, but we waited too long.', exact: true })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Feedback details', exact: true }).waitFor();
    await page.getByText('How was your visit?', { exact: true }).waitFor();
    checks.push('Feedback persisted after refresh and opens original question/answers');
    await page.goto(origin + '/#/reports');
    await page.getByRole('button', { name: 'Create report', exact: true }).click();
    await page.getByRole('heading', { name: 'Source evidence', exact: true }).waitFor();
    checks.push('Report creates saved evidence snapshot with waiting-for-model state');
  }
  for (const language of ['en', 'ar']) {
    await page.evaluate((value) => localStorage.setItem('nuvia-language', value), language);
    await page.reload();
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of process.env.QA_ROUTES?.split(',') || [
        'surveys',
        'survey-builder',
        'feedbacks',
        'dashboard',
        'analytics',
        'reports',
        'team',
        'branches',
        'assistant',
        'settings',
      ]) {
        await page.goto(origin + '/#/' + route);
        await page.locator(`[data-product-route="${route}"] h1`).waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        await page
          .getByRole('status')
          .filter({ hasText: language === 'ar' ? 'جارٍ التحميل' : 'Loading' })
          .waitFor({ state: 'hidden' });
        assert.equal(
          await page.getByRole('alert').count(),
          0,
          `API error ${language}/${width}/${route}`,
        );
        const check = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          dir: document.documentElement.dir,
          heading: document.querySelector('h1')?.textContent,
          missing: [...document.images]
            .filter((i) => !i.complete || !i.naturalWidth)
            .map((i) => i.src),
        }));
        assert.equal(check.overflow, false, `Overflow ${language}/${width}/${route}`);
        assert.equal(check.dir, language === 'ar' ? 'rtl' : 'ltr');
        assert.ok(check.heading);
        assert.deepEqual(check.missing, []);
        if (['surveys', 'survey-builder', 'feedbacks', 'dashboard', 'reports'].includes(route))
          await page.screenshot({
            path: path.join(output, `${route}-${language}-${width}.png`),
            fullPage: false,
            timeout: 15000,
          });
        checks.push(`${route} ${language} ${width}: content/direction/overflow/assets pass`);
      }
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify({ origin, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors, output }));
} finally {
  await browser.close();
}
