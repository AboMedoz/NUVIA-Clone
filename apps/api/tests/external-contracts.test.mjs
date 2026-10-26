import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHmac } from 'node:crypto';
import { validateGoogleIdToken, startGoogle } from '../src/modules/auth/google.mjs';
import { verifyStripeEvent } from '../src/modules/billing/stripe.mjs';
import { createCheckout } from '../src/modules/billing/service.mjs';
import { loadConfig } from '../src/config/env.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' };
const now = Date.parse('2026-10-26T10:00:00Z');
function token(overrides = {}, header = {}) {
  const parts = [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid, ...header })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: 'client',
        sub: 'google-subject',
        email: 'Owner@example.test',
        email_verified: true,
        nonce: 'nonce',
        iat: now / 1000 - 10,
        exp: now / 1000 + 3600,
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
test('Google ID tokens require a verified signature, issuer, audience, nonce, expiry and verified address', () => {
  const options = { clientId: 'client', nonce: 'nonce', now };
  assert.equal(validateGoogleIdToken(token(), [key], options).email, 'owner@example.test');
  for (const invalid of [
    { iss: 'https://attacker.test' },
    { aud: 'other-client' },
    { nonce: 'other-browser' },
    { exp: now / 1000 },
    { email_verified: false },
    { azp: 'other-client' },
    { sub: '' },
  ]) {
    assert.throws(() => validateGoogleIdToken(token(invalid), [key], options), {
      code: 'GOOGLE_IDENTITY_INVALID',
    });
  }
  assert.throws(() => validateGoogleIdToken(token({}, { alg: 'none' }), [key], options), {
    code: 'GOOGLE_IDENTITY_INVALID',
  });
  const tampered = token().slice(0, -3) + 'aaa';
  assert.throws(() => validateGoogleIdToken(tampered, [key], options), {
    code: 'GOOGLE_IDENTITY_INVALID',
  });
});

test('Stripe webhook signatures cover exact raw bytes and reject expiry or forged payloads', () => {
  const raw = Buffer.from(
    JSON.stringify({
      id: 'evt_test',
      type: 'customer.subscription.updated',
      created: now / 1000,
      data: { object: { id: 'sub_test' } },
    }),
  );
  const secret = 'whsec_synthetic';
  const signature = createHmac('sha256', secret)
    .update(now / 1000 + '.')
    .update(raw)
    .digest('hex');
  const header = 't=' + now / 1000 + ',v1=' + signature;
  assert.equal(verifyStripeEvent(raw, header, secret, now).id, 'evt_test');
  assert.throws(
    () =>
      verifyStripeEvent(
        Buffer.from(raw.toString().replace('sub_test', 'sub_other')),
        header,
        secret,
        now,
      ),
    { code: 'INVALID_WEBHOOK_SIGNATURE' },
  );
  assert.throws(() => verifyStripeEvent(raw, header, secret, now + 301000), {
    code: 'INVALID_WEBHOOK_SIGNATURE',
  });
  assert.throws(() => verifyStripeEvent(raw, 't=0,' + header, secret, now), {
    code: 'INVALID_WEBHOOK_SIGNATURE',
  });
  assert.throws(() => verifyStripeEvent(JSON.parse(raw.toString()), header, secret, now), {
    code: 'INVALID_WEBHOOK_SIGNATURE',
  });
});

test('missing external credentials never create fake login or billing success', async () => {
  const deps = {
    config: {},
    fetch: () => {
      throw new Error('must not call external provider');
    },
  };
  await assert.rejects(() => startGoogle({ terms: true }, {}, deps), {
    code: 'GOOGLE_NOT_CONFIGURED',
  });
  await assert.rejects(() => createCheckout('pro', {}, {}, deps), {
    code: 'BILLING_NOT_CONFIGURED',
  });
});

test('external config stays optional and callback origin cannot escape the configured application', () => {
  const env = {
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    MAIL_ENCRYPTION_KEY: 'a'.repeat(64),
  };
  const config = loadConfig(env);
  assert.equal(config.google.clientId, '');
  assert.equal(config.billing.secretKey, '');
  assert.equal(config.google.redirectUri, config.appOrigin + '/api/v1/auth/google/callback');
  assert.throws(
    () => loadConfig({ ...env, GOOGLE_REDIRECT_URI: 'https://attacker.test/callback' }),
    /GOOGLE_REDIRECT_URI/,
  );
});
