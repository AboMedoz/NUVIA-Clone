import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export async function ensureModelSetup(root) {
  const envPath = resolve(root, '.env');
  let content;
  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('Run pnpm setup:local first; existing development configuration is preserved.');
  }
  const values = parseEnv(content);
  const defaults = {
    AI_SERVICE_URL: 'http://127.0.0.1:8000',
    AI_SERVICE_KEY: randomBytes(32).toString('hex'),
    AI_MODEL_MANIFEST_DIR: '.local/models',
    AI_MODEL_ROOT: '.local/models',
  };
  const additions = Object.entries(defaults)
    .filter(([key]) => !values[key])
    .map(([key, value]) => `${key}=${value}`);
  if (additions.length)
    await writeFile(envPath, `${content.trimEnd()}\n${additions.join('\n')}\n`, { mode: 0o600 });
  // Existing private model locations are never overwritten or populated with fake models.
  if (!values.AI_MODEL_MANIFEST_DIR || values.AI_MODEL_MANIFEST_DIR === '.local/models')
    await mkdir(resolve(root, '.local/models'), { recursive: true });
  return { added: additions.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await ensureModelSetup(fileURLToPath(new URL('../', import.meta.url)));
  console.log(
    'Private AI settings ready. Existing keys and model configuration preserved; no models downloaded.',
  );
}
