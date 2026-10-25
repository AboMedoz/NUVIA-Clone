import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { buildDevelopmentServices } from './development-services.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const withAI = process.argv.includes('--with-ai');
const envPath = resolve(root, '.env');
const localEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const env = { ...localEnv, ...process.env };
const services = buildDevelopmentServices({ root, env, withAI });
for (const port of withAI ? [3001, 5173, 8000] : [3001, 5173]) {
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(new Error(`Port ${port} is already in use. Stop its owner first.`)),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
    }
  }
  setTimeout(() => process.exit(code), 7000).unref();
}
for (const { name, command, args, cwd, env: childEnv } of services) {
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  children.push(child);
  child.on('error', () => {
    console.error(`Could not start ${name}.`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log(`Starting NUVIA web/API/mail${withAI ? '/AI' : ''}; Ctrl+C stops this group.`);
async function waitFor(url) {
  const deadline = Date.now() + 20000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Startup can take a moment. */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!stopping)
    throw new Error(
      'Development services did not become ready. Check private MongoDB configuration.',
    );
}
try {
  await Promise.all([
    waitFor('http://127.0.0.1:3001/api/v1/health/ready'),
    waitFor('http://127.0.0.1:5173/'),
    ...(withAI ? [waitFor('http://127.0.0.1:8000/api/v1/health/live')] : []),
  ]);
  if (!stopping) console.log('NUVIA ready at http://127.0.0.1:5173/');
} catch (error) {
  console.error(error.message);
  stop(1);
}
