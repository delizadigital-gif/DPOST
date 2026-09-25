import { DEFAULT_PLAN_ID, type PlanLimits } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';

export interface WorkspaceUsage {
  planId: string;
  planName: string;
  limits: PlanLimits;
  used: { aiPosts: number; aiImages: number; scheduledPosts: number };
}

/** Limits from the plan, and what this workspace has used this month. */
const FALLBACK_LIMITS: PlanLimits = {
  aiPosts: 0,
  aiImages: 0,
  scheduledPosts: 0,
  channels: 0,
  members: 1,
  workspaces: 1,
};

/** First day of the current month, in UTC: the period usage counters use. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getWorkspaceUsage(ctx: Context): Promise<WorkspaceUsage> {
  assertCan(ctx.role, 'workspace:read');

  const [subscription, counters] = await Promise.all([
    ctx.db.subscription.findFirst({
      select: { plan: { select: { id: true, name: true, limits: true } } },
    }),
    ctx.db.usageCounter.findMany({
      where: { periodStart: currentPeriodStart() },
      select: { metric: true, count: true },
    }),
  ]);

  const counted = (metric: string) =>
    counters.find((counter) => counter.metric === metric)?.count ?? 0;

  return {
    planId: subscription?.plan.id ?? DEFAULT_PLAN_ID,
    planName: subscription?.plan.name ?? 'Free',
    limits: (subscription?.plan.limits as PlanLimits | undefined) ?? FALLBACK_LIMITS,
    used: {
      aiPosts: counted('ai_posts'),
      aiImages: counted('ai_images'),
      scheduledPosts: counted('scheduled_posts'),
    },
  };
}
