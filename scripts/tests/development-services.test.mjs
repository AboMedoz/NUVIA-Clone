import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDevelopmentServices } from '../development-services.mjs';

test('default development keeps the existing three services and does not require AI', () => {
  const services = buildDevelopmentServices({ root: '/nuvia', env: {}, withAI: false });
  assert.deepEqual(
    services.map((service) => service.name),
    ['api', 'mail', 'web'],
  );
});

test('shared Qwen package configuration belongs only to the AI child', () => {
  const services = buildDevelopmentServices({
    root: '/nuvia',
    env: {
      AI_SERVICE_KEY: 'test-key',
      AI_PROVIDER: 'qwen',
      QWEN_MODEL_PACKAGE: '/private/models/qwen',
      QWEN_CAPABILITIES: 'assistant,report',
    },
    withAI: true,
  });
  for (const service of services.filter((item) => item.name !== 'ai')) {
    assert.equal(service.env.QWEN_MODEL_PACKAGE, undefined);
    assert.equal(service.env.QWEN_CAPABILITIES, undefined);
  }
  assert.equal(
    services.find((item) => item.name === 'ai').env.QWEN_CAPABILITIES,
    'assistant,report',
  );
});

test('full development starts internal AI with only its configuration and no database/mail secrets', () => {
  const env = {
    PATH: 'system-path',
    AI_SERVICE_KEY: 'test-key',
    AI_MODEL_ROOT: '/models',
    MONGODB_URI: 'private',
    SMTP_PASSWORD: 'private',
    MAIL_ENCRYPTION_KEY: 'private',
  };
  const services = buildDevelopmentServices({ root: '/nuvia', env, withAI: true });
  const ai = services.find((service) => service.name === 'ai');
  assert.equal(ai.command, 'uv');
  assert.equal(ai.env.AI_SERVICE_KEY, 'test-key');
  assert.equal(ai.env.AI_MODEL_ROOT, '/models');
  assert.equal(ai.env.PATH, 'system-path');
  assert.equal(ai.env.MONGODB_URI, undefined);
  assert.equal(ai.env.SMTP_PASSWORD, undefined);
  assert.equal(ai.env.MAIL_ENCRYPTION_KEY, undefined);
  assert.ok(ai.args.includes('--offline'), 'Development cannot implicitly download model runtime');
  assert.equal(ai.args.at(-1), '8000');
});

test('full development rejects absent service key before launching children', () => {
  assert.throws(
    () => buildDevelopmentServices({ root: '/nuvia', env: {}, withAI: true }),
    /setup:models/,
  );
});

test('explicit local Python runtime is launched directly without modifying its environment', () => {
  const services = buildDevelopmentServices({
    root: '/nuvia',
    env: { AI_SERVICE_KEY: 'test-key', AI_PYTHON_EXECUTABLE: process.execPath },
    withAI: true,
  });
  const ai = services.find((service) => service.name === 'ai');
  assert.equal(ai.command, process.execPath);
  assert.deepEqual(ai.args.slice(0, 3), ['-m', 'uvicorn', 'app.main:app']);
  assert.ok(ai.cwd.endsWith('apps/ai-service') || ai.cwd.endsWith('apps\\ai-service'));
  assert.equal(ai.env.HF_HUB_OFFLINE, '1');
  assert.equal(ai.env.PYTHONDONTWRITEBYTECODE, '1');
});

test('Python runtime override requires an existing absolute executable path', () => {
  assert.throws(
    () =>
      buildDevelopmentServices({
        root: '/nuvia',
        env: { AI_SERVICE_KEY: 'test-key', AI_PYTHON_EXECUTABLE: 'python' },
        withAI: true,
      }),
    /absolute/,
  );
});

test('Gemini credentials belong only to the AI child and do not alter offline local loading', () => {
  const env = {
    AI_SERVICE_KEY: 'test-key',
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'private-provider-key',
    GEMINI_MODEL: 'test-model',
  };
  const services = buildDevelopmentServices({ root: '/nuvia', env, withAI: true });
  for (const service of services.filter((item) => item.name !== 'ai')) {
    assert.equal(service.env.GEMINI_API_KEY, undefined);
    assert.equal(service.env.GEMINI_MODEL, undefined);
  }
  const ai = services.find((item) => item.name === 'ai');
  assert.equal(ai.env.GEMINI_API_KEY, env.GEMINI_API_KEY);
  assert.equal(ai.env.AI_PROVIDER, 'gemini');
  assert.equal(ai.env.HF_HUB_OFFLINE, '1');
  assert.equal(env.GEMINI_API_KEY, 'private-provider-key', 'Caller configuration is preserved');
});

test('ordinary development also excludes provider secrets from its children', () => {
  const services = buildDevelopmentServices({
    root: '/nuvia',
    env: { GEMINI_API_KEY: 'private-provider-key' },
    withAI: false,
  });
  assert.ok(services.every((item) => item.env.GEMINI_API_KEY === undefined));
});
