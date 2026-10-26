import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHmac, randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers/database.mjs';
import { createHttp } from './helpers/http.mjs';
import { createSession, digest } from '../src/modules/auth/sessions.mjs';
import {
  startGoogle,
  finishGoogle,
  completeGoogleSecondFactor,
} from '../src/modules/auth/google.mjs';
import { encryptPayload, decryptPayload } from '../src/modules/mail/crypto.mjs';
import { totp } from '../src/modules/account/totp.mjs';
import {
  billingView,
  createCheckout,
  processBillingWebhook,
} from '../src/modules/billing/service.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'RS256' };

test('external integration Google linking requires password proof and explicitly connects the same verified account', async () => {
  const deps = await createTestDatabase();
  try {
    deps.config.google = {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: deps.config.appOrigin + '/api/v1/auth/google/callback',
    };
    const http = createHttp(deps),
      password = 'Synthetic123!';
    await http.mutate(
      'post',
      '/auth/register',
      {
        name: 'Local owner',
        email: 'google-owner@example.test',
        password,
        terms: true,
        locale: 'en',
      },
      201,
    );
    const mail = await deps.models.MailOutbox.findOne({ kind: 'verify' }).lean();
    await http.mutate('post', '/auth/verify-email', {
      token: decryptPayload(mail.payload, deps.config.mailKey).token,
    });
    await http.mutate('post', '/auth/login', { email: 'google-owner@example.test', password });
    await http.mutate(
      'post',
      '/auth/google/start',
      { link: true, currentPassword: 'incorrect' },
      401,
    );
    const result = await http.mutate('post', '/auth/google/start', {
      link: true,
      currentPassword: password,
    });
    const state = new URL(result.body.url).searchParams.get('state');
    const record = await deps.models.OAuthState.findOne({ digest: digest(state) }).lean();
    const nonce = decryptPayload(record.payload, deps.config.mailKey).nonce;
    deps.fetch = async (url) =>
      new Response(
        JSON.stringify(
          url.includes('/token')
            ? { id_token: idToken(nonce, deps.now().getTime()) }
            : { keys: [jwk] },
        ),
        { status: 200 },
      );
    const callback = await http.agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'fixture-code' })
      .expect(303);
    assert.match(callback.headers.location, /settings-security\?google=linked$/);
    assert.equal((await http.get('/account')).body.googleConnected, true);
    await http.mutate('post', '/auth/google/unlink', { currentPassword: 'incorrect' }, 401);
    await http.mutate('post', '/auth/google/unlink', { currentPassword: password });
    assert.equal((await http.get('/account')).body.googleConnected, false);
  } finally {
    await deps.cleanup();
  }
});
function idToken(nonce, now, overrides = {}) {
  const parts = [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: 'fixture-client',
        sub: 'fixture-subject',
        email: 'google-owner@example.test',
        email_verified: true,
        name: 'Google owner',
        nonce,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 3600,
        ...overrides,
      }),
    ).toString('base64url'),
  ];
  return (
    parts.join('.') +
    '.' +
    sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url')
  );
}
async function anonymous(deps) {
  let raw;
  const res = {
    cookie: (_name, value) => {
      raw = value;
    },
    clearCookie() {},
  };
  await createSession(res, {}, deps);
  return { req: { cookies: { nuvia_session: raw } }, res };
}

test('external integration Google binds single-use state to the initiating browser and preserves second factor', async () => {
  const deps = await createTestDatabase();
  try {
    deps.config.google = {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: deps.config.appOrigin + '/api/v1/auth/google/callback',
    };
    const first = await anonymous(deps);
    const second = await anonymous(deps);
    let nonce;
    deps.fetch = async (url) =>
      new Response(
        JSON.stringify(
          url.includes('/token')
            ? { id_token: idToken(nonce, deps.now().getTime()) }
            : { keys: [jwk] },
        ),
        { status: 200 },
      );
    const begin = async (browser) => {
      const result = await startGoogle({ terms: true, locale: 'en' }, browser.req, deps);
      const state = new URL(result.url).searchParams.get('state');
      const record = await deps.models.OAuthState.findOne({ digest: digest(state) }).lean();
      nonce = decryptPayload(record.payload, deps.config.mailKey).nonce;
      assert.ok(new URL(result.url).searchParams.get('code_challenge'));
      assert.ok(!JSON.stringify(record).includes('fixture-secret'));
      return state;
    };
    const state = await begin(first);
    await assert.rejects(
      () => finishGoogle({ state, code: 'fixture-code' }, second.req, second.res, deps),
      { code: 'GOOGLE_STATE_INVALID' },
    );
    assert.equal(
      (await finishGoogle({ state, code: 'fixture-code' }, first.req, first.res, deps)).status,
      'signed_in',
    );
    await assert.rejects(
      () => finishGoogle({ state, code: 'fixture-code' }, first.req, first.res, deps),
      { code: 'GOOGLE_STATE_INVALID' },
    );
    const user = await deps.models.User.findOne({ googleSubject: 'fixture-subject' }).lean();
    assert.ok(user.verifiedAt);
    assert.ok(user.passwordHash.startsWith('scrypt$'));
    const secret = 'JBSWY3DPEHPK3PXP';
    await deps.models.User.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecret: encryptPayload({ secret }, deps.config.mailKey),
        },
      },
    );
    const challengeBrowser = await anonymous(deps);
    const challengeState = await begin(challengeBrowser);
    const result = await finishGoogle(
      { state: challengeState, code: 'fixture-code' },
      challengeBrowser.req,
      challengeBrowser.res,
      deps,
    );
    assert.equal(result.status, 'second_factor_required');
    await assert.rejects(
      () =>
        completeGoogleSecondFactor(
          { challenge: result.challenge, code: 'invalid' },
          challengeBrowser.req,
          challengeBrowser.res,
          deps,
        ),
      { code: 'INVALID_TWO_FACTOR' },
    );
    assert.equal(
      (
        await completeGoogleSecondFactor(
          { challenge: result.challenge, code: totp(secret, deps.now().getTime()) },
          challengeBrowser.req,
          challengeBrowser.res,
          deps,
        )
      ).status,
      'signed_in',
    );
  } finally {
    await deps.cleanup();
  }
});

test('external integration Google never auto-links an existing password account by matching email', async () => {
  const deps = await createTestDatabase();
  try {
    deps.config.google = {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: deps.config.appOrigin + '/api/v1/auth/google/callback',
    };
    await deps.db
      .collection('users')
      .insertOne({ _id: randomUUID(), email: 'google-owner@example.test' });
    const browser = await anonymous(deps);
    const result = await startGoogle({ terms: true, locale: 'en' }, browser.req, deps);
    const state = new URL(result.url).searchParams.get('state');
    const record = await deps.models.OAuthState.findOne({ digest: digest(state) }).lean();
    const nonce = decryptPayload(record.payload, deps.config.mailKey).nonce;
    deps.fetch = async (url) =>
      new Response(
        JSON.stringify(
          url.includes('/token')
            ? { id_token: idToken(nonce, deps.now().getTime()) }
            : { keys: [jwk] },
        ),
        { status: 200 },
      );
    await assert.rejects(
      () => finishGoogle({ state, code: 'fixture-code' }, browser.req, browser.res, deps),
      { code: 'GOOGLE_ACCOUNT_NOT_LINKED' },
    );
    assert.equal(await deps.models.User.countDocuments(), 1);
    assert.equal(await deps.models.User.countDocuments({ googleSubject: { $exists: true } }), 0);
  } finally {
    await deps.cleanup();
  }
});

test('external integration billing activates only current signed provider state with deduplication and workspace binding', async () => {
  const deps = await createTestDatabase();
  try {
    const workspaceId = randomUUID();
    const access = { workspace: { _id: workspaceId, name: 'Synthetic business' }, role: 'owner' };
    deps.config.billing = {
      secretKey: 'sk_test_synthetic',
      webhookSecret: 'whsec_synthetic',
      apiVersion: '2026-09-30.endive',
      prices: { pro: 'price_synthetic' },
    };
    let state = 'active';
    let calls = 0;
    deps.fetch = async (url) => {
      calls++;
      const value = url.endsWith('/customers')
        ? { id: 'cus_synthetic' }
        : url.endsWith('/checkout/sessions')
          ? {
              id: 'cs_test_synthetic',
              url: 'https://checkout.stripe.com/c/pay/synthetic',
              expires_at: Math.floor(deps.now().getTime() / 1000) + 3600,
            }
          : {
              id: 'sub_synthetic',
              customer: 'cus_synthetic',
              status: state,
              metadata: { workspaceId },
              items: {
                data: [
                  {
                    price: { id: 'price_synthetic' },
                    current_period_end: Math.floor(deps.now().getTime() / 1000) + 86400,
                  },
                ],
              },
            };
      return new Response(JSON.stringify(value), { status: 200 });
    };
    await createCheckout('pro', access, { email: 'owner@example.test' }, deps);
    assert.equal((await billingView(access, deps)).plan.id, 'free');
    const before = calls;
    await createCheckout('pro', access, { email: 'owner@example.test' }, deps);
    assert.equal(calls, before);
    const send = async (id, created, customer = 'cus_synthetic') => {
      const event = {
        id,
        type: 'customer.subscription.updated',
        created,
        data: { object: { id: 'sub_synthetic', customer, status: 'active' } },
      };
      const raw = Buffer.from(JSON.stringify(event));
      const timestamp = Math.floor(deps.now().getTime() / 1000);
      const signature = createHmac('sha256', deps.config.billing.webhookSecret)
        .update(timestamp + '.')
        .update(raw)
        .digest('hex');
      return processBillingWebhook(raw, 't=' + timestamp + ',v1=' + signature, deps);
    };
    const created = Math.floor(deps.now().getTime() / 1000);
    await send('evt_synthetic1', created);
    assert.equal((await billingView(access, deps)).plan.id, 'pro');
    const after = calls;
    await send('evt_synthetic1', created);
    assert.equal(calls, after);
    state = 'canceled';
    await send('evt_synthetic2', created + 1);
    assert.equal((await billingView(access, deps)).plan.id, 'free');
    assert.equal((await billingView(access, deps)).subscription.status, 'canceled');
    state = 'active';
    await send('evt_synthetic3', created - 1);
    assert.equal((await billingView(access, deps)).plan.id, 'free');
    assert.equal(await deps.models.BillingEvent.countDocuments(), 3);
  } finally {
    await deps.cleanup();
  }
});
