import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ensureModelSetup } from '../setup-models.mjs';

test('model setup adds a shared private key once and preserves existing configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nuvia-model-setup-'));
  try {
    await writeFile(
      join(root, '.env'),
      'MONGODB_DATABASE=chosen_database\nMAIL_ENCRYPTION_KEY=existing_key\n',
    );
    assert.equal((await ensureModelSetup(root)).added, 4);
    const before = await readFile(join(root, '.env'), 'utf8');
    const config = parseEnv(before);
    assert.equal(config.MONGODB_DATABASE, 'chosen_database');
    assert.equal(config.MAIL_ENCRYPTION_KEY, 'existing_key');
    assert.match(config.AI_SERVICE_KEY, /^[a-f0-9]{64}$/);
    assert.equal((await ensureModelSetup(root)).added, 0);
    assert.equal(await readFile(join(root, '.env'), 'utf8'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('model setup does not create incomplete database/mail configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nuvia-model-setup-'));
  try {
    await assert.rejects(ensureModelSetup(root), /setup:local/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
