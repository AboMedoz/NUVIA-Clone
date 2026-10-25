import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createServer } from 'vite';
import { createTestDatabase } from '../../apps/api/tests/helpers/database.mjs';
import { createHttp } from '../../apps/api/tests/helpers/http.mjs';
import { hashPassword } from '../../apps/api/src/modules/auth/passwords.mjs';

const binary = process.env.MONGOMS_SYSTEM_BINARY;
if (!binary || !existsSync(binary))
  throw new Error('Set MONGOMS_SYSTEM_BINARY; this QA server never downloads MongoDB.');
let replica,
  deps,
  api,
  web,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await web?.close();
  if (api) {
    api.closeAllConnections();
    await new Promise((done) => api.close(done));
  }
  try {
    await deps?.cleanup();
  } catch {
    // Windows console shutdown may stop the owned mongod before the parent cleanup.
    await deps?.close();
  } finally {
    await replica?.stop();
  }
}
process.on('SIGINT', () => {
  stop().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  stop().then(() => process.exit(0));
});
try {
  replica = await MongoMemoryReplSet.create({
    binary: { systemBinary: binary, version: '7.0.24' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_TEST_URI = replica.getUri();
  deps = await createTestDatabase();
  deps.config.appOrigin = 'http://127.0.0.1:5191';
  const http = createHttp(deps);
  const user = {
    _id: randomUUID(),
    name: 'QA Owner',
    email: 'qa-owner@example.test',
    locale: 'en',
    verifiedAt: deps.now(),
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
    passwordHash: await hashPassword('Synthetic123'),
    credentialsVersion: 1,
  };
  await deps.models.User.insertOne(user);
  await http.mutate('post', '/auth/login', { email: user.email, password: 'Synthetic123' });
  await http.mutate('put', '/workspace', { businessName: 'QA Cafe', industry: 'Cafe' });
  await http.mutate('put', '/workspace/setup', { branchType: 'multiple', branchName: 'Cairo' });
  const workspace = (await http.get('/workspace')).body;
  await http.mutate('post', `/workspaces/${workspace.id}/branches`, { name: 'Giza' }, 201);
  api = http.app.listen(0, '127.0.0.1');
  await new Promise((done, reject) => {
    api.once('listening', done);
    api.once('error', reject);
  });
  web = await createServer({
    root: resolve('apps/web'),
    configFile: resolve('apps/web/vite.config.js'),
    configLoader: 'runner',
    server: {
      host: '127.0.0.1',
      port: 5191,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${api.address().port}` },
    },
  });
  await web.listen();
  console.log(
    'Isolated synthetic QA server ready at http://127.0.0.1:5191; qa-owner@example.test / Synthetic123. No real mail or inference. Ctrl+C cleans up.',
  );
  setTimeout(
    () => {
      stop().then(() => process.exit(0));
    },
    20 * 60 * 1000,
  ).unref();
} catch (error) {
  await stop();
  console.error(error);
  process.exitCode = 1;
}
