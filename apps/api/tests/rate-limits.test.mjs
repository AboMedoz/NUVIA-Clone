import assert from 'node:assert/strict';
import test from 'node:test';
import { createLimiter } from '../src/middleware/rate-limits.mjs';

test('product-sized rate window blocks request 301 until its exact expiry', () => {
  let time = Date.UTC(2026, 9, 27);
  const start = time;
  const windowMs = 900000;
  const limit = createLimiter({ now: () => new Date(time) });
  const headers = new Map();
  const res = { set: (name, value) => headers.set(name, value) };
  const request = () => limit('product:synthetic-user', 300, windowMs, res);
  for (let count = 0; count < 300; count++) request();
  assert.throws(request, { status: 429, code: 'RATE_LIMITED' });
  assert.equal(headers.get('Retry-After'), '900');
  time = start + windowMs - 1;
  assert.throws(request, { status: 429, code: 'RATE_LIMITED' });
  assert.equal(headers.get('Retry-After'), '1');
  time = start + windowMs;
  assert.doesNotThrow(request);
  for (let count = 1; count < 300; count++) request();
  assert.throws(request, { status: 429, code: 'RATE_LIMITED' });
});
