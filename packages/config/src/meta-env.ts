import { z } from 'zod';
import { EnvValidationError } from './env';

/**
 * Credentials for the Meta app that publishes to Facebook Pages.
 *
 * All optional: without them DPOST runs exactly as before and the Channels
 * screen says connecting isn't set up, rather than failing inside an OAuth
 * redirect. See docs/08-facebook-integration.md for where each one comes
 * from and what Meta requires before a public launch.
 */
export const metaEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** developers.facebook.com → your app → Settings → Basic. */
    META_APP_ID: z.string().min(1).optional(),
    /** Server only. It signs app-secret proofs and verifies webhooks. */
    META_APP_SECRET: z.string().min(1).optional(),

    /**
     * The Graph API version every request is pinned to.
     *
     * Meta ships a new version roughly quarterly and retires old ones after
     * about two years, so this is an environment variable: it can be moved
     * without a deploy. **Check Meta's changelog before changing it** — field
     * names and permissions differ between versions, and our adapter's
     * fixtures were recorded against the pinned one.
     */
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/u, 'looks like `v23.0`')
      .default('v23.0'),

    /** Facebook Login for Business configuration, if one is used. */
    META_LOGIN_CONFIG_ID: z.string().min(1).optional(),

    /** A random string you choose; Meta echoes it when verifying a webhook. */
    META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.META_APP_ID) !== Boolean(env.META_APP_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['META_APP_SECRET'],
        message: 'set both META_APP_ID and META_APP_SECRET, or neither',
      });
    }
  });

export type MetaEnv = z.infer<typeof metaEnvSchema>;

export function parseMetaEnv(source: Record<string, string | undefined> = process.env): MetaEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = metaEnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: MetaEnv | undefined;

export function getMetaEnv(): MetaEnv {
  cached ??= parseMetaEnv();
  return cached;
}

/** Whether a Facebook Page can be connected at all on this server. */
export function isMetaConfigured(env: MetaEnv = getMetaEnv()): boolean {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET);
}
