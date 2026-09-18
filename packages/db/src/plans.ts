/**
 * The plan catalogue, seeded into the `plans` table. Limits are read from
 * the database at runtime, so they can be tuned without a deploy; this file
 * is the starting point and the source for new environments.
 *
 * Prices are placeholders until AI cost per post is measured (Phase 8+).
 * Amounts are in minor units: 1 BDT = 100 poisha.
 */
export interface PlanLimits {
  aiPosts: number;
  aiImages: number;
  /** null = unlimited */
  scheduledPosts: number | null;
  channels: number;
  members: number;
  workspaces: number;
}

export interface PlanDefinition {
  id: 'free' | 'starter' | 'business' | 'agency';
  name: string;
  sortOrder: number;
  limits: PlanLimits;
  prices: { currency: 'BDT'; interval: 'month'; amountMinor: number }[];
}

export const PLAN_CATALOGUE: readonly PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    sortOrder: 0,
    limits: {
      aiPosts: 30,
      aiImages: 5,
      scheduledPosts: 30,
      channels: 1,
      members: 1,
      workspaces: 1,
    },
    prices: [{ currency: 'BDT', interval: 'month', amountMinor: 0 }],
  },
  {
    id: 'starter',
    name: 'Starter',
    sortOrder: 1,
    limits: {
      aiPosts: 300,
      aiImages: 50,
      scheduledPosts: 300,
      channels: 3,
      members: 1,
      workspaces: 1,
    },
    prices: [{ currency: 'BDT', interval: 'month', amountMinor: 99_900 }],
  },
  {
    id: 'business',
    name: 'Business',
    sortOrder: 2,
    limits: {
      aiPosts: 1_500,
      aiImages: 200,
      scheduledPosts: 1_500,
      channels: 10,
      members: 3,
      workspaces: 1,
    },
    prices: [{ currency: 'BDT', interval: 'month', amountMinor: 249_900 }],
  },
  {
    id: 'agency',
    name: 'Agency',
    sortOrder: 3,
    limits: {
      aiPosts: 5_000,
      aiImages: 600,
      scheduledPosts: null,
      channels: 30,
      members: 10,
      workspaces: 10,
    },
    prices: [{ currency: 'BDT', interval: 'month', amountMinor: 699_900 }],
  },
];

export const DEFAULT_PLAN_ID: PlanDefinition['id'] = 'free';
