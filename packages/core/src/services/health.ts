import { getUnscopedDb } from '@dpost/db';
import { getRedis } from '../lib/redis';

export type DependencyStatus = 'ok' | 'error';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { database: DependencyStatus; redis: DependencyStatus };
}

const TIMEOUT_MS = 2_000;

async function probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('health check timed out')), TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** Checks the database and Redis. Reports status only, never error details. */
export async function checkHealth(): Promise<HealthReport> {
  const [database, redis] = await Promise.all([
    probe(() => getUnscopedDb().$queryRaw`SELECT 1`),
    probe(() => getRedis().ping()),
  ]);
  return {
    status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
    checks: { database, redis },
  };
}
