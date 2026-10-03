import { z } from 'zod';
import { EnvValidationError } from './env';
import { isPublicDeployment } from './local';

/**
 * Where uploaded and generated images live.
 *
 * Two drivers. `local` writes to a folder on disk and is meant for
 * development: a deployed container's filesystem is wiped on every deploy,
 * so it is refused in production. `s3` is any S3-compatible object store —
 * Cloudflare R2, Backblaze B2, AWS itself — which is what a deployment uses.
 */
export const storageEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

    /** Where the local driver keeps files, relative to the repository root. */
    STORAGE_LOCAL_DIR: z.string().min(1).default('.media'),

    /** R2: `https://<account id>.r2.cloudflarestorage.com`. */
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('auto'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

    /**
     * The public address files are served from — an R2 custom domain, say.
     * Facebook downloads images from this address, so it has to be reachable
     * from the internet, not just from us.
     */
    MEDIA_PUBLIC_BASE_URL: z.url().optional(),

    /** Refused above this size, before anything is read into memory. */
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),

    /** Read only to tell a local run from a deployed site. */
    APP_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
        }
      }
      if (!env.MEDIA_PUBLIC_BASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['MEDIA_PUBLIC_BASE_URL'],
          message: 'required when STORAGE_DRIVER=s3: Facebook fetches images from it',
        });
      }
    }

    // A deployed container's disk does not survive a deploy, and Facebook
    // cannot reach it either. A production build served on localhost — which
    // is what the end-to-end tests run — is fine.
    if (env.STORAGE_DRIVER === 'local' && isPublicDeployment(env.NODE_ENV, env.APP_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'local storage cannot serve a deployed site: set STORAGE_DRIVER=s3',
      });
    }
  });

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export function parseStorageEnv(
  source: Record<string, string | undefined> = process.env,
): StorageEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = storageEnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: StorageEnv | undefined;

export function getStorageEnv(): StorageEnv {
  cached ??= parseStorageEnv();
  return cached;
}
