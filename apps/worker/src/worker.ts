import type { Logger, Redis } from '@dpost/core';

export interface WorkerHandle {
  stop(): Promise<void>;
}

export interface StartWorkerOptions {
  logger: Logger;
  redis: Pick<Redis, 'set'>;
  heartbeatIntervalMs?: number;
}

/** Redis key holding the last heartbeat; it expires if the worker stalls. */
export const HEARTBEAT_KEY = 'worker:heartbeat';

/**
 * Starts the background worker. For now it only records a heartbeat, which
 * the admin panel (Phase 15) reads to spot a stalled worker: the key expires
 * after three missed beats. Queue processors (publishing, AI generation,
 * sync) are registered here from Phase 8.
 */
export function startWorker({
  logger,
  redis,
  heartbeatIntervalMs = 60_000,
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

  return {
    async stop() {
      clearInterval(heartbeat);
      logger.info('worker stopped');
    },
  };
}
