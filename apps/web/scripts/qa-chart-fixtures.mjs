import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
// Explicit browser-only contract fixtures: never imported by product code or persisted.
const output = path.resolve('../../.superpowers/sdd/nuvia-completion/frontend-qa/chart-fixtures');
await fs.mkdir(output, { recursive: true });
const data = {
  totalResponses: 30,
  analyzedResponses: 30,
  pendingResponses: 0,
  sentimentDistribution: { positive: 18, negative: 7, neutral: 3, mixed: 2 },
  aspectScores: [
    { aspect: 'Service', score: 7.5, mentions: 20, lowSample: false },
    { aspect: 'Speed', score: 3.2, mentions: 12, lowSample: false },
  ],
  trends: [
    {
      date: '2026-10-01',
      totalResponses: 10,
      aspectScores: [
        { aspect: 'Service', score: 8 },
        { aspect: 'Speed', score: 6 },
      ],
    },
    {
      date: '2026-10-08',
      totalResponses: 10,
      aspectScores: [
        { aspect: 'Service', score: 7 },
        { aspect: 'Speed', score: 4.5 },
      ],
    },
    {
      date: '2026-10-15',
      totalResponses: 10,
      aspectScores: [
        { aspect: 'Service', score: 7.5 },
        { aspect: 'Speed', score: 3.2 },
      ],
    },
  ],
  topics: [],
  forecasts: [],
  comparisons: [],
  alerts: [],
};
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/v1/**', (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const body = pathname.endsWith('/auth/session')
    ? {
        csrfToken: 'fixture',
        user: { id: 'test-only', name: 'Test fixture owner', emailVerified: true },
        workspace: {
          id: 'fixture-workspace',
          businessName: 'TEST FIXTURE — no model inference',
          role: 'owner',
          onboardingStep: 'complete',
          branches: [],
        },
      }
    : pathname.endsWith('/analytics')
      ? data
      : pathname.endsWith('/surveys')
        ? { surveys: [] }
        : { jobs: [] };
  return route.fulfill({ json: body });
});
try {
  for (const language of ['en', 'ar']) {
    await page.goto('http://127.0.0.1:5198/#/analytics');
    await page.evaluate((value) => localStorage.setItem('nuvia-language', value), language);
    await page.reload();
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [tab, label] of [
        ['sentiment', language === 'ar' ? 'المشاعر' : 'Sentiment'],
        ['aspects', language === 'ar' ? 'الجوانب' : 'Aspects'],
        ['trends', language === 'ar' ? 'الاتجاهات' : 'Trends'],
      ]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('img').last().waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: path.join(output, `TEST-ONLY-${tab}-${language}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'provenance.json'),
    JSON.stringify(
      {
        testOnly: true,
        source:
          'Browser intercepted synthetic HTTP DTO fixtures; no model inference; never persisted',
        errors,
        checks: 12,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: 12, errors, output }));
} finally {
  await browser.close();
}
