/**
 * Runs once when a Next.js server instance starts. Validating the environment
 * here makes a misconfigured deploy fail immediately at boot, instead of on
 * the first request that touches the missing variable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getAiEnv, getAuthEnv, getServerEnv, isAiConfigured } = await import('@dpost/config');
  const { createLogger } = await import('@dpost/core');

  const env = getServerEnv();
  const authEnv = getAuthEnv();
  const aiEnv = getAiEnv();
  const logger = createLogger({ service: 'web', level: env.LOG_LEVEL, version: env.APP_VERSION });

  if (!authEnv.SMTP_URL) {
    logger.warn(
      'no email server configured: confirmation and password reset emails will NOT be sent',
    );
  }

  if (aiEnv.AI_PROVIDER === 'stub') {
    // Refused in production by the environment schema.
    logger.warn('AI provider is the STUB: nothing here was written by a model');
  } else if (!isAiConfigured(aiEnv)) {
    logger.warn('no ANTHROPIC_API_KEY: writing posts with AI is switched off');
  } else {
    logger.info({ smart: aiEnv.LLM_MODEL_SMART, fast: aiEnv.LLM_MODEL_FAST }, 'AI models ready');
  }
  logger.info('web server started');
}
