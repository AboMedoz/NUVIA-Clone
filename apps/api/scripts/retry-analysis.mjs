import { loadConfig } from '../src/config/env.mjs';
import { connectDatabase, ensureSchema } from '../src/shared/database/connection.mjs';
import { runJob } from '../src/modules/analysis/service.mjs';
let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config);
  await ensureSchema(connection.models);
  const deps = { ...connection, config, now: () => new Date() };
  const jobs = await deps.models.AnalysisJob.find({
    status: { $in: ['queued', 'waiting_for_model', 'failed'] },
  })
    .sort({ createdAt: 1 })
    .limit(1000)
    .lean();
  const order = ['normalization', 'language', 'sentiment', 'aspects', 'embeddings'];
  jobs.sort((a, b) => order.indexOf(a.capability) - order.indexOf(b.capability));
  for (const job of jobs) await runJob(job, deps);
  console.log(
    `Retried ${jobs.length} persisted analysis jobs; results remain capability-dependent.`,
  );
} catch {
  console.error('Analysis retry unavailable. Check private configuration and service readiness.');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
