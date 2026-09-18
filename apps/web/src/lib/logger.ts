import 'server-only';
import { getServerEnv } from '@dpost/config';
import { createLogger, type Logger } from '@dpost/core';

let logger: Logger | undefined;

export function getLogger(): Logger {
  if (!logger) {
    const env = getServerEnv();
    logger = createLogger({ service: 'web', level: env.LOG_LEVEL, version: env.APP_VERSION });
  }
  return logger;
}
