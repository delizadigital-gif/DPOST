import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { getAiEnv, isAiConfigured } from '@dpost/config';
import { AppError } from '../lib/errors';
import { createStubModel } from './stub';

/**
 * Two model slots, not model names.
 *
 * Features ask for `smart` (writing, strategy, the agent) or `fast`
 * (classification, checks, short rewrites). Which model fills each slot is
 * an environment variable, so swapping provider or model — or A/B testing
 * one — never touches feature code.
 *
 * The AI SDK is the provider abstraction; wrapping it in another one of our
 * own would add a layer that buys nothing.
 */

export type ModelRole = 'smart' | 'fast';

export interface ResolvedModel {
  model: LanguageModel;
  /** Recorded on every usage row, so cost can be attributed per model. */
  modelId: string;
  provider: 'anthropic' | 'stub';
}

/** Tests and the stub provider install a model here instead of calling out. */
let override: ((role: ModelRole) => ResolvedModel) | undefined;

export function setModelOverride(factory: ((role: ModelRole) => ResolvedModel) | undefined): void {
  override = factory;
}

export function getModel(role: ModelRole): ResolvedModel {
  if (override) return override(role);

  const env = getAiEnv();
  if (!isAiConfigured(env)) {
    throw new AppError('PLATFORM_ERROR', {
      message: "The AI isn't set up yet on this server. Please try again later.",
      details: { reason: 'ai_not_configured' },
    });
  }

  const modelId = role === 'smart' ? env.LLM_MODEL_SMART : env.LLM_MODEL_FAST;

  // Only reachable outside production: the environment schema refuses the
  // stub there. Resolved here rather than installed at start-up, because
  // module state set during instrumentation is not shared with route
  // handlers in a Next.js server.
  if (env.AI_PROVIDER === 'stub') return createStubModel();

  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  return { model: anthropic(modelId), modelId, provider: 'anthropic' };
}

/** Whether the server can call a model at all. The UI asks before offering to. */
export function aiIsAvailable(): boolean {
  return Boolean(override) || isAiConfigured();
}
