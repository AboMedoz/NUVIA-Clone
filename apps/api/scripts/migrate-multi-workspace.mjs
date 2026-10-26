import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config/env.mjs';
import { connectDatabase } from '../src/shared/database/connection.mjs';

const newIndex = { ownerUserId: 1, createdAt: 1 };
export function workspaceMigrationPlan(indexes) {
  const uniqueOwner = indexes.filter(
    (index) => index.unique && Object.keys(index.key).length === 1 && index.key.ownerUserId === 1,
  );
  if (
    uniqueOwner.some(
      (index) =>
        index.name !== 'ownerUserId_1' ||
        index.sparse ||
        index.partialFilterExpression ||
        index.collation,
    )
  )
    throw new Error('Unsupported owner index. Manual index review is required.');
  return { add: 'workspace_owner_created', remove: uniqueOwner.map((index) => index.name) };
}
export async function migrateWorkspaceIndex(collection, { apply = false } = {}) {
  const indexes = await collection.indexes().catch((error) => {
    if (error.code === 26) return [];
    throw error;
  });
  const plan = workspaceMigrationPlan(indexes);
  if (!apply) return { mode: 'preview', ...plan, dataChanges: false };
  await collection.createIndex(newIndex, { name: 'workspace_owner_created' });
  // Reinspect immediately before dropping only the reviewed legacy index specification.
  const current = workspaceMigrationPlan(await collection.indexes());
  for (const name of current.remove) await collection.dropIndex(name);
  return { mode: 'applied', ...plan, dataChanges: false };
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !['--apply', '--help'].includes(flag)))
    throw new Error('Use no flags to preview, or --apply to migrate the legacy index.');
  if (flags.includes('--help')) {
    console.log(
      'Preview: node apps/api/scripts/migrate-multi-workspace.mjs\nApply to the explicitly configured database: add --apply. No documents or IDs are changed.',
    );
    return;
  }
  const connection = await connectDatabase(loadConfig());
  try {
    console.log(
      JSON.stringify(
        await migrateWorkspaceIndex(connection.models.Workspace.collection, {
          apply: flags.includes('--apply'),
        }),
      ),
    );
  } finally {
    await connection.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(
      error.message.startsWith('Unsupported owner index') ||
        error.message.startsWith('Use no flags')
        ? error.message
        : 'Workspace migration failed. Check the configured database and index permissions.',
    );
    process.exitCode = 1;
  });
