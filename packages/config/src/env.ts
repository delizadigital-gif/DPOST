import { z } from 'zod';

/** Encryption keys as `version:base64key` pairs, e.g. `1:abc...=,2:def...=`. */
const encryptionKeys = z.string().transform((value, ctx) => {
  const keys = new Map<number, Buffer>();
  for (const entry of value.split(',').map((part) => part.trim())) {
    const [versionText, keyText] = entry.split(':');
    const version = Number(versionText);
    const key = Buffer.from(keyText ?? '', 'base64');
    if (!Number.isInteger(version) || version < 1 || key.length !== 32) {
      ctx.addIssue({
        code: 'custom',
        message: 'each entry must be `<version>:<32-byte key, base64>`',
      });
      return z.NEVER;
    }
    keys.set(version, key);
  }
  return keys;
});

/**
 * Server-side environment schema. Grows phase by phase; every variable the
 * app reads must be declared here so a missing or malformed value fails at
 * boot instead of at the first request that needs it.
 *
 * Nothing in this schema may be exposed to the browser.
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:3000'),
    APP_VERSION: z.string().min(1).default('dev'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    // Encryption of stored third-party tokens. Required from Phase 8, when
    // social accounts are connected; optional until then.
    TOKEN_ENCRYPTION_KEYS: encryptionKeys.optional(),
    TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().optional(),

    // Observability (optional everywhere; wired up at deployment).
    SENTRY_DSN: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    const keys = env.TOKEN_ENCRYPTION_KEYS;
    const version = env.TOKEN_ENCRYPTION_KEY_VERSION;
    if ((keys === undefined) !== (version === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_ENCRYPTION_KEY_VERSION'],
        message: 'set both TOKEN_ENCRYPTION_KEYS and TOKEN_ENCRYPTION_KEY_VERSION, or neither',
      });
    } else if (keys && version && !keys.has(version)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_ENCRYPTION_KEY_VERSION'],
        message: 'no key with this version in TOKEN_ENCRYPTION_KEYS',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Treat empty strings as unset: `.env` files often contain `KEY=` placeholders. */
function withoutEmptyStrings(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

/**
 * Parses and validates environment variables. Error messages name the
 * variable but never echo its value, because values may be secrets.
 */
export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse(withoutEmptyStrings(source));
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Validated env, parsed once per process. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}
