import type { Worker } from 'bullmq';
import type { Logger, Redis } from '@dpost/core';
import { startPublishWorker } from './processors/publish';
import { startMaintenance, type MaintenanceHandle } from './processors/maintenance';

export interface WorkerHandle {
  stop(): Promise<void>;
}

export interface StartWorkerOptions {
  logger: Logger;
  redis: Pick<Redis, 'set'>;
  heartbeatIntervalMs?: number;
  /** Off in tests, which have no queue to connect to. */
  queues?: boolean;
}

/** Redis key holding the last heartbeat; it expires if the worker stalls. */
export const HEARTBEAT_KEY = 'worker:heartbeat';

/**
 * Starts the background worker: the publishing queue, the jobs that keep it
 * honest (reconcile, token health), and a heartbeat the admin panel reads to
 * spot a stalled worker — the key expires after three missed beats.
 */
export function startWorker({
  logger,
  redis,
  heartbeatIntervalMs = 60_000,
  queues = true,
}: StartWorkerOptions): WorkerHandle {
  const startedAt = Date.now();
  const ttlSeconds = Math.ceil((heartbeatIntervalMs * 3) / 1000);

  const beat = async () => {
    const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);
    try {
      await redis.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', ttlSeconds);
      logger.debug({ uptimeSeconds }, 'worker heartbeat');
    } catch (error) {
      // Keep running: a Redis blip shouldn't stop the worker.
      logger.warn({ err: error, uptimeSeconds }, 'worker heartbeat failed');
    }
  };

  logger.info('worker started');
  void beat();
  const heartbeat = setInterval(() => void beat(), heartbeatIntervalMs);

  let publishWorker: Worker | undefined;
  let maintenance: MaintenanceHandle | undefined;
  if (queues) {
    publishWorker = startPublishWorker(logger);
    maintenance = startMaintenance({ logger });
    logger.info('publishing queue ready');
  }

  return {
    async stop() {
      clearInterval(heartbeat);
      maintenance?.stop();
      // Closing the worker lets the jobs in flight finish first, so a deploy
      // never cuts a post off half-published.
      await publishWorker?.close();
      logger.info('worker stopped');
    },
  };
}
