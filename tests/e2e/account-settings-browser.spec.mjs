import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decryptPayload } from '../../apps/api/src/modules/mail/crypto.mjs';
import { totp } from '../../apps/api/src/modules/account/totp.mjs';

export async function runAccountSettingsScenario({ browser, origin, deps, output }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/api/v1/branches' && response.status() >= 400)
      errors.push('Analytics requested nonexistent unscoped branches endpoint');
  });
  const email = 'settings-browser@example.test',
    password = 'Synthetic123!';
  let roleContext;
  const send = async (path, body, method = 'POST', sessionContext = context) => {
    const session = await sessionContext.request.get(origin + '/api/v1/auth/session');
    const { csrfToken } = await session.json();
    const response = await sessionContext.request.fetch(origin + '/api/v1' + path, {
      method,
      data: body,
      headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    });
    assert.ok(response.ok(), method + ' ' + path + ' -> ' + response.status());
    return response.status() === 204 ? null : response.json();
  };
  try {
    await send('/auth/register', {
      name: 'Settings browser owner',
      email,
      password,
      terms: true,
      locale: 'en',
    });
    const mail = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await send('/auth/verify-email', {
      token: decryptPayload(mail.payload, deps.config.mailKey).token,
    });
    await send('/auth/login', { email, password });
    await send(
      '/workspace',
      {
        businessName: 'Settings browser business',
        industry: 'Café',
        locale: 'en',
        reportingTimezone: 'Africa/Cairo',
      },
      'PUT',
    );
    await send('/workspace/setup', { branchType: 'single', branchName: 'Main branch' }, 'PUT');

    await page.goto(origin + '/#/settings-profile');
    await page.getByLabel(/Full name/).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('input[placeholder="Full name"]')?.value ===
        'Settings browser owner',
    );
    await page.getByLabel(/Full name/).fill('Saved settings owner');
    await page.getByLabel('Job title', { exact: true }).fill('Founder');
    let failed = false;
    await page.route('**/api/v1/account', async (route) => {
      if (route.request().method() === 'PATCH' && !failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        });
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Could not save or load' }).waitFor();
    assert.equal(await page.getByLabel(/Full name/).inputValue(), 'Saved settings owner');
    assert.equal((await deps.models.User.findOne({ email }).lean()).name, 'Settings browser owner');
    await page.unroute('**/api/v1/account');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('heading', { name: 'Account settings', exact: true }).waitFor();
    await page.reload();
    await page.getByText('Saved settings owner', { exact: true }).first().waitFor();

    await page.goto(origin + '/#/settings-language');
    await page.getByRole('button', { name: 'Display language', exact: true }).click();
    await page.getByRole('option', { name: 'العربية', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    assert.equal((await deps.models.User.findOne({ email }).lean()).preferences.language, 'ar');
    await page.setViewportSize({ width: 393, height: 850 });
    await page.waitForFunction(() => {
      const navigation = document.querySelector('.product-navigation');
      const bounds = navigation?.getBoundingClientRect();
      return !bounds || bounds.left >= innerWidth || bounds.right <= 0;
    });
    await page.screenshot({
      path: join(output, 'settings-language-ar-mobile.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const settingsCard = await page
      .locator('.new-preview-content .edit-layout > .card')
      .boundingBox();
    assert.ok(
      settingsCard && settingsCard.x >= 0 && settingsCard.x + settingsCard.width <= 394,
      'The actual settings card must fit the narrow viewport without clipped fields',
    );
    const savedPreferences = (await deps.models.User.findOne({ email }).lean()).preferences;
    await send('/account/preferences', { ...savedPreferences, language: 'en' }, 'PUT');
    await page.evaluate(() => localStorage.setItem('nuvia-language', 'en'));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(origin + '/#/settings-two-factor');
    await page.reload();
    await page.getByLabel(/Current password/).fill(password);
    const setupResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/account/two-factor/setup') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Generate setup key', exact: true }).click();
    assert.equal((await setupResponse).status(), 200);
    const pending = await deps.models.User.findOne({ email }).lean();
    const { secret } = decryptPayload(pending.twoFactorPending, deps.config.mailKey);
    const code = totp(secret);
    for (let index = 0; index < 6; index++)
      await page.getByLabel('Code digit ' + (index + 1), { exact: true }).fill(code[index]);
    await page.getByRole('button', { name: 'Verify & enable', exact: true }).click();
    const recoveryPanel = page.getByRole('status', { name: 'Recovery codes' });
    await recoveryPanel.waitFor();
    assert.equal(await recoveryPanel.locator('code').count(), 10);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download recovery codes', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'nuvia-recovery-codes.txt');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: join(output, 'settings-recovery-en-desktop.png'),
      fullPage: true,
    });
    const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    assert.ok(!local.includes(password) && !local.includes(secret));
    await page.getByRole('button', { name: 'I saved my codes', exact: true }).click();
    await page.getByRole('heading', { name: 'Account security', exact: true }).waitFor();
    await page.goto(origin + '/#/settings-two-factor');
    await page.getByLabel(/Current password/).fill(password);
    await page.getByLabel('Authenticator code', { exact: true }).fill(totp(secret));
    await page.getByRole('button', { name: 'Disable two-factor', exact: true }).click();
    await page.getByRole('button', { name: 'Generate setup key', exact: true }).waitFor();
    assert.equal((await deps.models.User.findOne({ email }).lean()).twoFactorEnabled, false);
    await page.goto(origin + '/#/settings-devices');
    await page.getByText('This device', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out of all devices', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    roleContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const rolePage = page;
    const roleSend = (path, body, method) => send(path, body, method, roleContext);
    const manager = await roleSend('/auth/register', {
      name: 'Settings team member',
      email: 'settings-manager@example.test',
      password,
      terms: true,
      locale: 'en',
    });
    const managerMail = await deps.models.MailOutbox.findOne({
      userId: manager.id,
      kind: 'verify',
      status: 'pending',
    }).lean();
    await roleSend('/auth/verify-email', {
      token: decryptPayload(managerMail.payload, deps.config.mailKey).token,
    });
    const workspace = await deps.models.Workspace.findOne({
      name: 'Settings browser business',
    }).lean();
    const branch = await deps.models.Branch.findOne({ workspaceId: workspace._id }).lean();
    const membershipId = randomUUID();
    await deps.models.Membership.insertOne({
      _id: membershipId,
      workspaceId: workspace._id,
      userId: manager.id,
      role: 'manager',
      branchIds: [branch._id],
      revokedAt: null,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    await rolePage.getByLabel('Work email').fill('settings-manager@example.test');
    await rolePage.getByLabel('Password', { exact: true }).fill(password);
    await rolePage.getByRole('button', { name: 'Log in', exact: true }).click();
    await rolePage.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    await rolePage.goto(origin + '/#/settings');
    await rolePage.reload();
    await rolePage.getByText('Workspace manager', { exact: true }).first().waitFor();
    assert.equal(await rolePage.getByText('Workspace owner', { exact: true }).count(), 0);
    await deps.models.Membership.updateOne({ _id: membershipId }, { $set: { role: 'viewer' } });
    await rolePage.reload();
    await rolePage.getByText('Workspace viewer', { exact: true }).first().waitFor();
    assert.equal(await rolePage.getByText('Workspace owner', { exact: true }).count(), 0);
    await rolePage.goto(origin + '/#/analytics-sentiment');
    await rolePage.getByRole('heading', { name: 'Sentiment Analysis', exact: true }).waitFor();
    const filterToggle = rolePage.locator('.analytics-filter-toggle');
    if (await filterToggle.isVisible()) await filterToggle.click();
    await rolePage
      .locator('.analytics-filters')
      .getByRole('button', { name: 'Branch', exact: true })
      .click();
    await rolePage.getByRole('option', { name: branch.name, exact: true }).waitFor();
    assert.ok(
      !(await rolePage.locator('.analytics-preview').textContent()).match(
        /1,248|974 of|Illustrative sample data/,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      'Settings browser: profile save/failure retention, saved Arabic locale/mobile, real TOTP enable/recovery download/disable, current-device badge, sign-out-all and real Manager/Viewer role labels PASS',
    );
  } catch (error) {
    await page.screenshot({ path: join(output, 'settings-failure.png'), fullPage: true });
    console.error(
      'Settings QA state:',
      page.url(),
      await page.locator('h1').allTextContents(),
      await page.locator('.badge').allTextContents(),
    );
    throw error;
  } finally {
    await roleContext?.close();
    await context.close();
  }
}
