/**
 * Runs once when a Next.js server instance starts. Validating the environment
 * here makes a misconfigured deploy fail immediately at boot, instead of on
 * the first request that touches the missing variable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getAuthEnv, getServerEnv } = await import('@dpost/config');
  const { createLogger } = await import('@dpost/core');

  const env = getServerEnv();
  getAuthEnv();
  createLogger({ service: 'web', level: env.LOG_LEVEL, version: env.APP_VERSION }).info(
    'web server started',
  );
}
