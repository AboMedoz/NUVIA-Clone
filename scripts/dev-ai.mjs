import { spawn, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { buildDevelopmentServices } from './development-services.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const service = buildDevelopmentServices({
  root,
  env: { ...local, ...process.env },
  withAI: true,
}).find((entry) => entry.name === 'ai');
const child = spawn(service.command, service.args, {
  cwd: service.cwd,
  env: service.env,
  stdio: 'inherit',
  windowsHide: true,
});
let closing = false;
function stop() {
  if (closing || child.exitCode !== null) return;
  closing = true;
  if (process.platform === 'win32')
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('error', () => {
  console.error('Could not start AI service. Install uv and sync the Python environment first.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = closing ? 0 : (code ?? 1);
});
