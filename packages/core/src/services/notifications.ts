import { assertCan } from '../authz/permissions';
import type { Context } from '../context';

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface RecentNotifications {
  items: NotificationSummary[];
  /** Unread count, capped so the badge never runs a huge query. */
  unread: number;
}

/** The newest notifications for the signed-in user, plus their unread count. */
export async function listRecentNotifications(
  ctx: Context,
  limit = 10,
): Promise<RecentNotifications> {
  assertCan(ctx.role, 'workspace:read');

  const where = { userId: ctx.userId };
  const [items, unread] = await Promise.all([
    ctx.db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    ctx.db.notification.count({ where: { ...where, readAt: null }, take: 100 }),
  ]);

  return { items, unread };
}
