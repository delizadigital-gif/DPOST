import { getUnscopedDb } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';

export interface MeResponse {
  user: { id: string; name: string; email: string; emailVerified: boolean; locale: string };
  workspace: { id: string; name: string; slug: string; timezone: string; locale: string };
  role: Context['role'];
  plan: { id: string; name: string; limits: unknown } | null;
}

/** The signed-in user, their active workspace, role and plan. */
export async function getMe(ctx: Context): Promise<MeResponse> {
  assertCan(ctx.role, 'workspace:read');

  const [user, workspace, subscription] = await Promise.all([
    // Users aren't tenant-owned; the lookup is by the session's own user ID.
    getUnscopedDb().user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, emailVerified: true, locale: true },
    }),
    ctx.db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { id: true, name: true, slug: true, timezone: true, locale: true },
    }),
    ctx.db.subscription.findFirst({
      select: { plan: { select: { id: true, name: true, limits: true } } },
    }),
  ]);

  if (!user || !workspace) throw new AppError('NOT_FOUND');

  return { user, workspace, role: ctx.role, plan: subscription?.plan ?? null };
}
