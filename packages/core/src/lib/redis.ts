import { Redis } from 'ioredis';
import { getServerEnv } from '@dpost/config';

/**
 * Redis for request-path work (rate limiting, caching, heartbeats).
 *
 * Commands issued while the client is still connecting wait for the
 * connection (the offline queue), so the first requests after boot work.
 * If Redis is actually down, a command gives up after one reconnect attempt,
 * and a command on a hung connection times out, so an outage degrades
 * features within about two seconds instead of hanging requests.
 * BullMQ creates its own, differently configured connections (Phase 8).
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
  });
}

const globalForRedis = globalThis as unknown as { __dpostRedis?: Redis };

export function getRedis(): Redis {
  globalForRedis.__dpostRedis ??= createRedis(getServerEnv().REDIS_URL);
  return globalForRedis.__dpostRedis;
}

export async function disconnectRedis(): Promise<void> {
  await globalForRedis.__dpostRedis?.quit().catch(() => undefined);
  globalForRedis.__dpostRedis = undefined;
}

export type { Redis };
