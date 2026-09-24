import { randomBytes } from 'node:crypto';
import { DEFAULT_PLAN_ID, getUnscopedDb } from '@dpost/db';

const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  // A random suffix keeps slugs unique without a lookup, and non-Latin names
  // (e.g. Bangla) that produce an empty base still get a valid slug.
  return `${base || 'workspace'}-${randomBytes(3).toString('hex')}`;
}

/**
 * Gives a user their first workspace, if they don't have one yet: the
 * workspace, the owner membership and a Free subscription, all in one
 * transaction. Idempotent and safe to call concurrently: a per-user
 * advisory lock stops two parallel calls from creating two workspaces.
 *
 * Returns the ID of the user's workspace.
 */
export async function ensurePersonalWorkspace(userId: string, userName: string): Promise<string> {
  const db = getUnscopedDb();
  // Fast path for the common case, without a transaction or lock.
  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });
  if (membership) return membership.workspaceId;

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace:${userId}`}))`;

    const existing = await tx.workspaceMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { workspaceId: true },
    });
    if (existing) return existing.workspaceId;

    const name = userName.trim() ? `${userName.trim()}'s workspace` : 'My workspace';
    const now = new Date();
    const workspace = await tx.workspace.create({
      data: {
        name,
        slug: slugify(userName),
        members: { create: { userId, role: 'owner' } },
        subscription: {
          create: {
            planId: DEFAULT_PLAN_ID,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + SUBSCRIPTION_PERIOD_MS),
          },
        },
      },
      select: { id: true },
    });
    return workspace.id;
  });
}
