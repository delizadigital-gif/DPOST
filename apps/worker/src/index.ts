import { getServerEnv } from '@dpost/config';
import { checkHealth, createLogger, disconnectRedis, getRedis } from '@dpost/core';
import { disconnectDb } from '@dpost/db';
import { startWorker } from './worker';

const env = getServerEnv();
const logger = createLogger({ service: 'worker', level: env.LOG_LEVEL, version: env.APP_VERSION });
const worker = startWorker({ logger, redis: getRedis() });

// Startup self-check, so a misconfigured deploy shows up in the first log lines.
void checkHealth().then(({ status, checks }) => {
  if (status === 'ok') logger.info({ checks }, 'dependencies reachable');
  else logger.error({ checks }, 'dependencies unreachable');
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown requested');
  // From Phase 8: stop taking new jobs and let in-flight jobs finish here.
  await worker.stop();
  await Promise.allSettled([disconnectRedis(), disconnectDb()]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
