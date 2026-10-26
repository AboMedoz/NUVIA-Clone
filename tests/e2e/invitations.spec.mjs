import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashPassword } from '../../apps/api/src/modules/auth/passwords.mjs';
import { deliverPendingMail } from '../../apps/api/src/modules/mail/worker.mjs';

export async function runInvitationScenario({ browser, origin, deps, output, results }) {
  const ownerId = randomUUID(),
    workspaceId = randomUUID(),
    branchId = randomUUID();
  const ownerEmail = 'invitation-owner@example.test',
    memberEmail = 'invitation-member@example.test';
  const now = deps.now();
  await deps.models.User.insertOne({
    _id: ownerId,
    name: 'Invitation Owner',
    email: ownerEmail,
    locale: 'en',
    verifiedAt: now,
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await deps.models.Workspace.insertOne({
    _id: workspaceId,
    ownerUserId: ownerId,
    name: 'Invitation Browser Cafe',
    industry: 'Cafe',
    locale: 'en',
    reportingTimezone: 'Africa/Cairo',
    branchMode: 'multiple',
    primaryBranchId: branchId,
    onboardingStep: 'complete',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await deps.models.Branch.insertOne({
    _id: branchId,
    workspaceId,
    name: 'Cairo',
    normalizedName: 'cairo',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = results.errors,
    requests = results.requests;
  let rawToken;
  const watch = (context) =>
    context.on('page', (page) => {
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('response', (response) => {
        if (new URL(response.url()).pathname.startsWith('/api/')) {
          requests.push({
            method: response.request().method(),
            path: new URL(response.url()).pathname,
            status: response.status(),
          });
          if (response.status() >= 400)
            errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
        }
      });
    });
  watch(ownerContext);
  watch(memberContext);
  const ownerPage = await ownerContext.newPage(),
    memberPage = await memberContext.newPage();
  const screenshot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
    results.screenshots.push(name + '.png');
  };
  const session = async (page) => {
    const response = await page.request.get(origin + '/api/v1/auth/session');
    assert.equal(response.status(), 200);
    return response.json();
  };
  const storageSafe = async (page) => {
    const storage = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    assert.ok(
      !storage.includes(rawToken),
      'Invitation bearer must never enter local/session storage',
    );
    assert.ok(!storage.includes('Synthetic123'), 'Passwords must never enter browser storage');
    assert.ok(!storage.includes('nuvia_session'), 'Session cookie must not enter browser storage');
  };
  const login = async (page, email) => {
    await page.getByLabel('Work email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
  };
  try {
    await ownerPage.goto(origin + '/#/login');
    assert.match(await ownerPage.title(), /NUVIA/i);
    await login(ownerPage, ownerEmail);
    await ownerPage.waitForURL('**/#/dashboard');
    await ownerPage.goto(origin + '/#/team');
    await ownerPage.getByRole('heading', { name: 'Business & Teams', exact: true }).waitFor();
    await ownerPage.getByLabel('Email', { exact: true }).fill(memberEmail);
    await ownerPage.getByLabel(/^Role/).selectOption('viewer');
    await ownerPage.getByLabel('Cairo', { exact: true }).check();
    const createdResponse = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/team/invitations' &&
        response.request().method() === 'POST',
    );
    await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const invitationResponse = await createdResponse;
    assert.equal(invitationResponse.status(), 201);
    const { invitation } = await invitationResponse.json();
    assert.ok(invitation.acceptUrl.startsWith(origin + '/#/team/accept?token='));
    rawToken = new URLSearchParams(new URL(invitation.acceptUrl).hash.split('?')[1]).get('token');
    assert.ok(rawToken);
    results.checks.push(
      'Owner creates actual viewer invitation for the Cairo branch through the UI',
    );

    await memberPage.goto(invitation.acceptUrl);
    await memberPage.getByRole('link', { name: 'Sign in to accept', exact: true }).waitFor();
    assert.equal(memberPage.url(), origin + '/#/team/accept');
    await storageSafe(memberPage);
    const anonymous = await session(memberPage);
    assert.equal(anonymous.pendingInvitation, true);
    assert.equal(anonymous.user, null);
    const anonymousCookie = (await memberContext.cookies()).find(
      (cookie) => cookie.name === 'nuvia_session',
    );
    assert.equal(anonymousCookie?.httpOnly, true);
    assert.equal(anonymousCookie?.sameSite, 'Lax');
    const tokenDigest = createHash('sha256').update(rawToken).digest('hex');
    assert.ok(await deps.models.Session.findOne({ pendingInvitationDigest: tokenDigest }).lean());
    results.checks.push(
      'Anonymous HttpOnly SameSite cookie holds server digest; invitation URL is scrubbed; no bearer in browser storage',
    );
    await screenshot(memberPage, 'join-anonymous-en-desktop');
    await memberPage.getByRole('link', { name: 'Sign in to accept', exact: true }).click();
    await memberPage.getByRole('link', { name: 'Create an account', exact: true }).click();
    await memberPage.getByLabel('Full name', { exact: true }).fill('Invited Viewer');
    await memberPage.getByLabel('Work email', { exact: true }).fill(memberEmail);
    await memberPage.getByLabel('Password', { exact: true }).fill('Synthetic123');
    await memberPage.getByLabel('Confirm password', { exact: true }).fill('Synthetic123');
    await memberPage.getByRole('checkbox').check();
    await memberPage.getByRole('button', { name: 'Create account', exact: true }).click();
    await memberPage.getByRole('heading', { name: 'Check your inbox', exact: true }).waitFor();
    assert.equal((await session(memberPage)).pendingInvitation, true);
    await storageSafe(memberPage);
    const delivered = await deliverPendingMail(deps);
    assert.equal(delivered.failed, 0);
    let verificationUrl;
    for (const file of await readdir(deps.config.mailDirectory)) {
      const mail = JSON.parse(await readFile(join(deps.config.mailDirectory, file), 'utf8'));
      if (mail.to === memberEmail)
        verificationUrl ||= mail.text
          .split('\n')
          .find((line) => line.startsWith(origin + '/#/verify-email?token='));
    }
    assert.ok(verificationUrl, 'Private local verification mail must exist for invited member');
    const verificationPage = await memberContext.newPage();
    await verificationPage.goto(verificationUrl);
    await verificationPage.getByRole('heading', { name: 'Email verified', exact: true }).waitFor();
    assert.ok(!verificationPage.url().includes('token='));
    assert.equal((await session(verificationPage)).pendingInvitation, true);
    await storageSafe(verificationPage);
    await screenshot(verificationPage, 'verification-new-tab-en-desktop');
    await verificationPage.getByRole('link', { name: 'Back to log in', exact: true }).click();
    await login(verificationPage, memberEmail);
    await verificationPage
      .getByRole('button', { name: 'Accept invitation', exact: true })
      .waitFor();
    assert.match(verificationPage.url(), /#\/team(?:\/|-)accept$/);
    assert.equal(
      await verificationPage
        .getByRole('heading', { name: 'Business information', exact: true })
        .count(),
      0,
    );
    const signedIn = await session(verificationPage);
    assert.equal(signedIn.pendingInvitation, true);
    assert.equal(signedIn.user.email, memberEmail);
    assert.equal(signedIn.user.emailVerified, true);
    assert.equal(signedIn.workspace, null);
    const rotatedCookie = (await memberContext.cookies()).find(
      (cookie) => cookie.name === 'nuvia_session',
    );
    assert.notEqual(
      rotatedCookie.value,
      anonymousCookie.value,
      'Login must rotate the session cookie',
    );
    await storageSafe(verificationPage);
    results.checks.push(
      'Signup and real file-mail verification in a NEW TAB retain invitation across login cookie rotation and show joining before onboarding',
    );
    await screenshot(verificationPage, 'join-authenticated-en-desktop');

    await verificationPage.evaluate(() => localStorage.setItem('nuvia-language', 'ar'));
    await verificationPage.setViewportSize({ width: 393, height: 800 });
    await verificationPage.reload();
    await verificationPage.getByRole('button', { name: 'قبول الدعوة', exact: true }).waitFor();
    assert.equal(await verificationPage.locator('html').getAttribute('dir'), 'rtl');
    assert.ok(
      await verificationPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    await screenshot(verificationPage, 'join-authenticated-ar-narrow');
    const acceptedResponse = verificationPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/team/accept' &&
        response.request().method() === 'POST',
    );
    await verificationPage.getByRole('button', { name: 'قبول الدعوة', exact: true }).click();
    const accepted = await acceptedResponse;
    assert.equal(accepted.status(), 200);
    assert.deepEqual(
      accepted.request().postDataJSON(),
      {},
      'Acceptance consumes server digest without sending the bearer again',
    );
    await verificationPage.waitForURL('**/#/dashboard');
    await verificationPage.getByRole('heading', { name: 'نظرة عامة', exact: true }).waitFor();
    await verificationPage
      .locator('.scope-empty')
      .getByText('لا توجد ردود في هذه الفترة', { exact: true })
      .waitFor();
    const final = await session(verificationPage);
    assert.equal(final.pendingInvitation, false);
    assert.equal(final.workspace.id, workspaceId);
    assert.equal(final.workspace.role, 'viewer');
    assert.deepEqual(final.workspace.allowedBranchIds, [branchId]);
    assert.equal(await deps.models.Workspace.countDocuments({ ownerUserId: final.user.id }), 0);
    const membership = await deps.models.Membership.findOne({
      workspaceId,
      userId: final.user.id,
      revokedAt: null,
    }).lean();
    assert.equal(membership.role, 'viewer');
    assert.deepEqual(membership.branchIds, [branchId]);
    const persisted = await deps.models.Invitation.findOne({ tokenDigest }).lean();
    assert.ok(persisted.acceptedAt);
    assert.equal(
      await deps.models.Session.countDocuments({
        userId: final.user.id,
        pendingInvitationDigest: { $ne: null },
      }),
      0,
    );
    assert.ok(!JSON.stringify(await deps.models.Session.find({}).lean()).includes(rawToken));
    await storageSafe(verificationPage);
    await verificationPage.reload();
    await verificationPage.getByRole('heading', { name: 'نظرة عامة', exact: true }).waitFor();
    await verificationPage
      .locator('.scope-empty')
      .getByText('لا توجد ردود في هذه الفترة', { exact: true })
      .waitFor();
    await screenshot(verificationPage, 'joined-viewer-ar-narrow');
    results.checks.push(
      'Arabic narrow acceptance consumes server digest; persisted viewer membership has only Cairo; pending clears; refresh retains shared workspace; no accidental owner workspace',
    );
    for (const page of [ownerPage, memberPage, verificationPage])
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.deepEqual(errors, [], 'Real browser console, runtime, and API errors must be empty');
    results.checks.push(
      'Page identity/content, no framework overlay, no console/runtime/API errors',
    );
  } catch (error) {
    for (const [index, page] of memberContext.pages().entries()) {
      await screenshot(page, `failure-member-${index}`).catch(() => {});
    }
    throw error;
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
}
