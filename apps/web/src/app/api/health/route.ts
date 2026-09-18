import { getServerEnv } from '@dpost/config';
import { checkHealth } from '@dpost/core';

// Always evaluated at request time: a cached health check is useless.
export const dynamic = 'force-dynamic';

/**
 * Health endpoint for the host's health checks and uptime monitoring.
 * Returns 503 when the database or Redis is unreachable. It reports status
 * only, never configuration, error messages or other internals.
 */
export async function GET() {
  const { status, checks } = await checkHealth();
  return Response.json(
    {
      status,
      version: getServerEnv().APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    },
    { status: status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
