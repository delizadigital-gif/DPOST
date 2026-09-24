import { z } from 'zod';
import { EnvValidationError } from './env';

/**
 * Settings only the web app needs: authentication and outgoing email.
 * Kept out of the shared server schema so the worker never receives the
 * session-signing secret it has no use for.
 */
export const authEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Signs session cookies and tokens. 32+ random characters. */
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),

    /** "Continue with Google". Optional: the button only appears when both are set. */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    /**
     * Outgoing email. Local: Mailpit (smtp://localhost:1025).
     * Production: Resend over SMTP (smtps://resend:<API key>@smtp.resend.com:465).
     * Unset in tests, where emails are kept in memory.
     */
    SMTP_URL: z.url().optional(),
    EMAIL_FROM: z.string().min(3).default('DPOST <no-reply@dpost.local>'),

    /** Public contact address shown on the legal pages. */
    CONTACT_EMAIL: z.email().optional(),

    /**
     * Allows running in production without an email server, for a staging
     * site before an email provider is set up. Confirmation and password
     * reset emails are then not sent at all, so never enable this for real
     * users. It must be set deliberately; the check below fails otherwise.
     */
    ALLOW_MISSING_SMTP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SMTP_URL && !env.ALLOW_MISSING_SMTP) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'required in production (or set ALLOW_MISSING_SMTP=true for a staging site)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.CONTACT_EMAIL) {
      // The legal pages must show a real way to reach us (Meta App Review checks this).
      ctx.addIssue({ code: 'custom', path: ['CONTACT_EMAIL'], message: 'required in production' });
    }
  });

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseAuthEnv(source: Record<string, string | undefined> = process.env): AuthEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = authEnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cached ??= parseAuthEnv();
  return cached;
}
