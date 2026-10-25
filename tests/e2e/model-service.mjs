import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { executeTask, capabilities } from '../../apps/api/src/integrations/ai-service/client.mjs';
import { buildClusteringSample } from '../../apps/api/src/modules/analysis/datasets.mjs';

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const modelRoot = await mkdtemp(join(tmpdir(), 'nuvia-contract-models-'));
const key = randomUUID();
let output = '';
const child = spawn(
  'uv',
  [
    'run',
    '--offline',
    '--locked',
    '--directory',
    resolve('apps/ai-service'),
    'uvicorn',
    'app.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      AI_SERVICE_KEY: key,
      AI_PROVIDER: 'local',
      GEMINI_API_KEY: '',
      AI_MODEL_ROOT: modelRoot,
      AI_MODEL_MANIFEST_DIR: modelRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
child.stdout.on('data', (chunk) => {
  output = (output + chunk).slice(-4000);
});
child.stderr.on('data', (chunk) => {
  output = (output + chunk).slice(-4000);
});
child.on('error', (error) => {
  output += error.message;
});
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      if ((await fetch(`${base}/api/v1/health/live`, { signal: AbortSignal.timeout(500) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Process startup can take a moment. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, `AI contract service did not become ready: ${output}`);
  const unauthenticated = await fetch(`${base}/api/v1/capabilities`);
  assert.equal(unauthenticated.status, 401);
  const deps = { config: { aiServiceKey: key, aiServiceUrl: base, aiTimeoutMs: 5000 } };
  const registry = await capabilities(deps);
  assert.ok(
    registry.capabilities.some((entry) => entry.capability === 'normalization' && entry.available),
  );
  assert.ok(
    registry.capabilities.some((entry) => entry.capability === 'sentiment' && !entry.available),
  );
  const text = 'الخدمة ممتازة. Delivery was slow!';
  const input = { taskId: randomUUID(), locale: 'ar', text };
  const normalized = await executeTask('normalization', input, deps);
  assert.equal(normalized.status, 'succeeded', JSON.stringify(normalized));
  assert.equal(normalized.result.text, text);
  assert.ok(normalized.result.sentences.length >= 2);
  for (const separator of ['\u0085', '\u001c', '\u001f', '\u2028', '\ufeff']) {
    const source = `Good.${separator}Bad.${separator}`;
    const prepared = await executeTask(
      'normalization',
      { taskId: randomUUID(), locale: 'en', text: source },
      deps,
    );
    assert.equal(
      prepared.status,
      'succeeded',
      `Source separator U+${separator.codePointAt(0).toString(16)}`,
    );
    assert.equal(prepared.result.text, source);
  }
  const language = await executeTask('language', input, deps);
  assert.equal(language.status, 'succeeded');
  assert.equal(language.result.language, 'mixed');
  const sentiment = await executeTask(
    'sentiment',
    { ...input, sentences: normalized.result.sentences },
    deps,
  );
  assert.equal(sentiment.status, 'unavailable');
  assert.equal(sentiment.error, 'model_unavailable');
  const largeText = `${'a'.repeat(6000)}\n${'b'.repeat(6000)}`;
  const largeInput = {
    taskId: randomUUID(),
    locale: 'en',
    text: largeText,
    evidence: [{ id: 'large-response', text: largeText }],
  };
  const largeNormalization = await executeTask('normalization', largeInput, deps);
  assert.equal(
    largeNormalization.status,
    'succeeded',
    'Accepted multi-answer responses must fit the real Python preparation contract',
  );
  assert.equal(largeNormalization.result.text.length, 12001);
  const rows = Array.from({ length: 32 }, (_, index) => {
    const id = `vector-${index}`;
    return {
      _id: id,
      text: `Synthetic review ${index}`,
      createdAt: new Date(),
      analysis: { embeddings: { vectors: [{ id, values: Array(768).fill(1e-7) }] } },
    };
  });
  const vectorSample = buildClusteringSample(rows);
  assert.ok(vectorSample.evidence.length >= 5);
  const vectorAdmission = await fetch(`${base}/api/v1/tasks/clustering`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AI-Service-Key': key },
    body: JSON.stringify({ schemaVersion: 1, taskId: randomUUID(), locale: 'en', ...vectorSample }),
  });
  assert.equal(
    vectorAdmission.status,
    503,
    'A sampled realistic small-exponent vector payload must reach model readiness, not fail request validation',
  );
  assert.equal((await vectorAdmission.json()).error.code, 'model_unavailable');
  const rejected = await fetch(`${base}/api/v1/tasks/normalization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AI-Service-Key': 'wrong-key' },
    body: JSON.stringify({ schemaVersion: 1, ...input }),
  });
  assert.equal(rejected.status, 401);
  console.log(
    'Live Node-to-FastAPI authentication, capabilities, bilingual preprocessing, exact sentence offsets and missing-model contract: PASS',
  );
} finally {
  if (child.exitCode === null) {
    if (process.platform === 'win32')
      await new Promise((done) =>
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], done),
      );
    else child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise((done) => setTimeout(done, 3000))]);
  }
  await rm(modelRoot, { recursive: true, force: true });
}
