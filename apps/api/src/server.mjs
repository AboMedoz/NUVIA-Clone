import { loadConfig } from './config/env.mjs';
import { connectDatabase, ensureSchema } from './shared/database/connection.mjs';
import { createApp } from './app.mjs';
import { runPendingAnalysis } from './modules/analysis/service.mjs';

let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config);
  await ensureSchema(connection.models);
  const deps = { ...connection, config, now: () => new Date() };
  let analysisRunning = false;
  const analysisTimer = setInterval(async () => {
    if (analysisRunning) return;
    analysisRunning = true;
    try {
      await runPendingAnalysis(deps);
    } catch {
      console.error('Analysis cycle unavailable; queued jobs are retained.');
    } finally {
      analysisRunning = false;
    }
  }, 5000);
  analysisTimer.unref();
  const server = createApp(deps).listen(config.port, config.host, () =>
    console.log(`NUVIA API listening on ${config.host}:${config.port}`),
  );
  server.on('error', async () => {
    clearInterval(analysisTimer);
    console.error('API listener failed.');
    await connection.close();
    process.exitCode = 1;
  });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    clearInterval(analysisTimer);
    server.close(async () => {
      await connection.close();
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
} catch (error) {
  await connection?.close();

  console.error('API startup failed:', {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  });

  process.exitCode = 1;
}