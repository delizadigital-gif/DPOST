import type { Prisma } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { currentPeriodStart, getWorkspaceUsage } from '../services/usage';

/**
 * Money. Every model call is metered and every metered feature is checked
 * against the workspace's plan **before** the call, not after — a quota that
 * is enforced afterwards is a bill you have already paid.
 */

/** Quota metrics, mapped to their `usage_counters.metric` names. */
export const QUOTA_METRICS = {
  aiPosts: 'ai_posts',
  aiImages: 'ai_images',
  scheduledPosts: 'scheduled_posts',
} as const;

export type QuotaMetric = keyof typeof QUOTA_METRICS;

export interface QuotaState {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export async function getQuota(ctx: Context, metric: QuotaMetric): Promise<QuotaState> {
  const usage = await getWorkspaceUsage(ctx);
  const limit = usage.limits[metric] ?? 0;
  const used = usage.used[metric] ?? 0;
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

/**
 * Refuses the request when the plan's allowance is spent. The error carries
 * the numbers so the UI can say "you've used 30 of 30 this month" instead of
 * a bare refusal.
 */
export async function assertCanUse(
  ctx: Context,
  metric: QuotaMetric,
  amount = 1,
): Promise<QuotaState> {
  const quota = await getQuota(ctx, metric);
  if (quota.remaining !== null && quota.remaining < amount) {
    throw new AppError('QUOTA_EXCEEDED', {
      message:
        quota.remaining === 0
          ? `You've used all ${quota.limit} AI posts on your plan this month.`
          : `Only ${quota.remaining} of your ${quota.limit} AI posts are left this month.`,
      details: { metric, limit: quota.limit, used: quota.used, requested: amount },
    });
  }
  return quota;
}

/**
 * Counts what was actually produced. Called after a successful generation,
 * so a failed call never costs the user part of their allowance.
 */
export async function recordQuotaUsage(
  ctx: Context,
  metric: QuotaMetric,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const periodStart = currentPeriodStart();
  const counterMetric = QUOTA_METRICS[metric];

  await ctx.db.usageCounter.upsert({
    where: {
      workspaceId_metric_periodStart: {
        workspaceId: ctx.workspaceId,
        metric: counterMetric,
        periodStart,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      metric: counterMetric,
      periodStart,
      count: amount,
    },
    update: { count: { increment: amount } },
  });
}

/**
 * Estimated price per million tokens, in US dollars.
 *
 * These are **estimates used for reporting only** — they are never charged
 * to anyone, and they must be checked against the provider's current pricing
 * page before they inform a plan price (docs/07, Phase 15). An unknown model
 * meters tokens with a zero cost rather than inventing a number.
 */
export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-5-5': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, outputPerMTok: 5 },
};

export function estimateCostMicros(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): bigint {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return 0n;
  const dollars =
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return BigInt(Math.round(dollars * 1_000_000));
}

export interface UsageRecord {
  feature: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  images?: number;
}

/**
 * Writes one `ai_usage_events` row. Every call to a model goes through here,
 * so "what did this workspace cost us this month" is a query rather than a
 * guess.
 */
export async function recordAiUsage(ctx: Context, record: UsageRecord): Promise<void> {
  const data: Prisma.AIUsageEventUncheckedCreateInput = {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    feature: record.feature,
    provider: record.provider,
    model: record.modelId,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    images: record.images ?? 0,
    costMicros: estimateCostMicros(record.modelId, record.inputTokens, record.outputTokens),
  };
  await ctx.db.aIUsageEvent.create({ data });
}

/**
 * Runs a model call and meters it whatever happens: a call that fails
 * half-way still consumed input tokens, and hiding that would make our cost
 * reporting quietly wrong.
 */
export async function withUsage<T>(
  ctx: Context,
  feature: string,
  call: () => Promise<{ result: T; usage: Omit<UsageRecord, 'feature'> }>,
): Promise<T> {
  assertCan(ctx.role, 'ai:use');
  const { result, usage } = await call();
  await recordAiUsage(ctx, { feature, ...usage });
  return result;
}
