import http from 'node:http';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';
import { seedIfEmpty } from './seed/seed.js';
import { startJobs } from './jobs/runner.js';
import { jobs } from './jobs/index.js';

async function start() {
  const { mode } = await connectDB();

  // An in-memory database starts empty every run, so populate it automatically.
  if (mode === 'in-memory') await seedIfEmpty();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    console.log(`[api]  http://localhost:${env.port}/api/health`);
    console.log(`[ws]   socket.io ready`);
    console.log(`[cors] allowing ${env.clientUrls.join(', ')}`);
  });

  // Releasing scheduled orders, and reconciling payments with Razorpay.
  const stopJobs = startJobs(jobs);
  console.log(`[jobs] ${jobs.map((j) => j.name).join(', ')}`);

  const shutdown = async (signal) => {
    console.log(`\n[${signal}] shutting down`);
    stopJobs();
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[fatal] failed to start:', err);
  process.exit(1);
});
