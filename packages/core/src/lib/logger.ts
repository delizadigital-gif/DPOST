import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Paths removed from every log line. Tokens and credentials must never reach
 * logs, even at debug level. Extend this list whenever a new secret-bearing
 * field appears.
 */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

export interface CreateLoggerOptions {
  service: string;
  level?: LoggerOptions['level'];
  version?: string;
  /** For tests: write to a custom destination instead of stdout. */
  destination?: DestinationStream;
}

/**
 * JSON logger shared by web and worker. Output is plain JSON in every
 * environment (pipe through `pino-pretty` locally for readability), because
 * pino transports run in worker threads that don't bundle well in Next.js.
 */
export function createLogger({
  service,
  level = 'info',
  version,
  destination,
}: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service, ...(version ? { version } : {}) },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  return destination ? pino(options, destination) : pino(options);
}

export type { Logger };
