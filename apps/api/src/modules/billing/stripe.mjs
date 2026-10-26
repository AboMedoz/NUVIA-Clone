import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';

export async function stripeRequest(path, body, deps, { method = 'POST', idempotencyKey } = {}) {
  const config = deps.config.billing;
  if (!config?.secretKey) throw new ApiError(503, 'BILLING_NOT_CONFIGURED');
  let response;
  try {
    response = await (deps.fetch || fetch)('https://api.stripe.com/v1/' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + config.secretKey,
        'Stripe-Version': config.apiVersion,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body ? { body: new URLSearchParams(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(502, 'BILLING_UNAVAILABLE');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new ApiError(502, 'BILLING_UNAVAILABLE');
  return result;
}

export function verifyStripeEvent(raw, header, secret, now = Date.now()) {
  const invalid = () => {
    throw new ApiError(400, 'INVALID_WEBHOOK_SIGNATURE');
  };
  if (!secret) throw new ApiError(503, 'BILLING_NOT_CONFIGURED');
  if (!Buffer.isBuffer(raw) || typeof header !== 'string' || header.length > 4096) invalid();
  const fields = header.split(',').map((field) => field.trim().split('='));
  const timestamps = fields.filter(([key]) => key === 't');
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1])) invalid();
  const timestamp = Number(timestamps[0][1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) invalid();
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(raw)
    .digest();
  const signatures = fields
    .filter(([key, value]) => key === 'v1' && /^[a-f0-9]{64}$/.test(value))
    .map(([, value]) => Buffer.from(value, 'hex'));
  if (!signatures.some((signature) => timingSafeEqual(expected, signature))) invalid();
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    invalid();
  }
  if (
    typeof event.id !== 'string' ||
    !/^evt_[a-zA-Z0-9]+$/.test(event.id) ||
    typeof event.type !== 'string' ||
    !Number.isSafeInteger(event.created) ||
    !event.data?.object
  )
    invalid();
  return event;
}
