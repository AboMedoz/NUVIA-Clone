import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { loadConfig } from '../../apps/api/src/config/env.mjs';
import { connectDatabase, ensureSchema } from '../../apps/api/src/shared/database/connection.mjs';
import { createApp } from '../../apps/api/src/app.mjs';
import { runProductBrowserScenario } from './product-browser.spec.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'test-results/product-browser');
const mailDirectory = await mkdtemp(join(tmpdir(), 'nuvia-product-browser-mail-'));
const results = {
  status: 'running',
  browser: 'Edge / Playwright',
  fallback: 'Browser plugin not available',
  viewports: ['1440x960', '1280x800', '768x800', '360x800', 'EN/AR'],
  checks: [],
  errors: [],
  requests: [],
  screenshots: [],
};
let replica, connection, apiServer, frontend, browser, cleaning;
const cleanup = () =>
  (cleaning ||= (async () => {
    await browser?.close();
    await frontend?.close();
    if (apiServer) {
      apiServer.closeAllConnections();
      await new Promise((done) => apiServer.close(done));
    }
    await connection?.close();
    await replica?.stop();
    await rm(mailDirectory, { recursive: true, force: true });
  })());
const interrupt = () => {
  process.exitCode = 130;
  void cleanup().finally(() => process.exit(130));
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
await mkdir(output, { recursive: true });
try {
  const binary = process.env.MONGOMS_SYSTEM_BINARY;
  if ((!binary || !existsSync(binary)) && process.env.CI !== 'true')
    throw new Error(
      'Set MONGOMS_SYSTEM_BINARY to an installed mongod; local runtime download disabled',
    );
  if (binary) process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
  replica = await MongoMemoryReplSet.create({
    binary: { ...(binary ? { systemBinary: binary } : {}), version: '7.0.24' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: replica.getUri(),
    MONGODB_DATABASE: `nuvia_test_${randomUUID()}`,
    MAIL_ENCRYPTION_KEY: 'c'.repeat(64),
    MAIL_MODE: 'file',
    MAIL_DIRECTORY: mailDirectory,
  });
  connection = await connectDatabase(config);
  await ensureSchema(connection.models);
  let clockOffsetMs = 0;
  const deps = { ...connection, config, now: () => new Date(Date.now() + clockOffsetMs) };
  const advanceVisualBatchWindow = (batch) => {
    // Independent visual batches use actual limiter expiry, keeping all limits enforced.
    const advancedMs = 900000;
    clockOffsetMs += advancedMs;
    (results.visualBatchClockAdvances ||= []).push({ ...batch, advancedMs, clockOffsetMs });
  };
  apiServer = createApp(deps).listen(0, '127.0.0.1');
  await new Promise((done, reject) => {
    apiServer.once('listening', done);
    apiServer.once('error', reject);
  });
  const portProbe = net.createServer();
  await new Promise((done) => portProbe.listen(0, '127.0.0.1', done));
  const webPort = portProbe.address().port;
  await new Promise((done) => portProbe.close(done));
  frontend = await createServer({
    root: resolve(root, 'apps/web'),
    configFile: resolve(root, 'apps/web/vite.config.js'),
    configLoader: 'runner',
    server: {
      host: '127.0.0.1',
      hmr: false,
      watch: null,
      port: webPort,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiServer.address().port}` },
    },
  });
  await frontend.listen();
  const origin = `http://127.0.0.1:${frontend.httpServer.address().port}`;
  config.appOrigin = origin;
  results.origin = origin;
  const executable =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(executable ? { executablePath: executable } : {}),
  });
  await runProductBrowserScenario({
    browser,
    origin,
    deps,
    output,
    results,
    advanceVisualBatchWindow,
  });
  results.status = 'PASS';
} catch (error) {
  results.status = 'FAIL';
  results.failure = error.message;
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  results.cleanup =
    'Owned browser, API, Vite, replica set and temporary file-mail directory closed/removed';
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  await writeFile(
    join(output, 'report.md'),
    `# Connected product real-browser QA\n\nStatus: **${results.status}**\n\nEnvironment: ${results.origin || 'startup failed'}; ${results.browser}; ${results.viewports.join(', ')}. ${results.fallback}.\n\nFlow: UI registration and file-mail verification → workspace/branches → six-type survey → publication and QR → anonymous submission/retry → saved feedback/CSV/history → branding/templates → responsive EN/AR screens. One deliberate 503 response checks public form recovery. All other interactions use the real isolated API. After functional authentication/data assertions, each independent locale/viewport visual batch advances only the isolated API clock by one real 15-minute rate-limit window; production limits and unexpected-429 assertions remain enforced. Clock advances are recorded in results.json. No AI provider is configured; no paid model calls.\n\n${results.checks.map((check) => '- PASS: ' + check).join('\n')}\n\n${results.failure ? 'Failure: ' + results.failure + '\n\n' : ''}Screenshots: ${results.screenshots.join(', ')}.\n\nLimits: local synthetic identities and isolated MongoDB replica set only; file mail is not SMTP acceptance. Single Edge engine; no production, Atlas, model quality, Safari/device or SMTP acceptance. Team invitation and password reset have separate browser scenarios.\n\nCommand: \`node tests/e2e/run-product-browser.mjs\`.\n\n${results.cleanup}.\n`,
  );
  console.log(
    JSON.stringify({
      status: results.status,
      checks: results.checks.length,
      apiRequests: results.requests.length,
      errors: results.errors,
      output,
    }),
  );
}
