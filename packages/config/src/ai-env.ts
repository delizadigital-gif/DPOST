import { z } from 'zod';
import { EnvValidationError } from './env';

/**
 * Settings for the AI features.
 *
 * The API key is **optional**: without it the app runs exactly as before and
 * anything that would call a model returns a clear "AI isn't configured"
 * error instead of failing deep inside a request. That keeps local
 * development, CI and the staging site working without spending money.
 */
export const aiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** From https://console.anthropic.com → API keys. Billed per token. */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    /**
     * Role-based model slots: features ask for "smart" or "fast", never for a
     * model name, so changing model is an environment change rather than a
     * code change.
     */
    LLM_MODEL_SMART: z.string().min(1).default('claude-sonnet-5'),
    LLM_MODEL_FAST: z.string().min(1).default('claude-haiku-4-5-20251001'),

    /**
     * `stub` replaces the provider with a deterministic fake for tests and
     * end-to-end runs, so the whole pipeline (quality gate, metering,
     * quotas, UI) can be exercised without an API key or a bill.
     *
     * It is refused in production, and anything it produces is labelled as
     * a stub in the API response and in the interface — a person must never
     * mistake it for something a model wrote.
     */
    AI_PROVIDER: z.enum(['anthropic', 'stub']).default('anthropic'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'stub') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'the stub provider must never be used in production',
      });
    }
  });

export type AiEnv = z.infer<typeof aiEnvSchema>;

export function parseAiEnv(source: Record<string, string | undefined> = process.env): AiEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = aiEnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: AiEnv | undefined;

export function getAiEnv(): AiEnv {
  cached ??= parseAiEnv();
  return cached;
}

/** Whether a model can actually be called right now. */
export function isAiConfigured(env: AiEnv = getAiEnv()): boolean {
  return env.AI_PROVIDER === 'stub' || Boolean(env.ANTHROPIC_API_KEY);
}
