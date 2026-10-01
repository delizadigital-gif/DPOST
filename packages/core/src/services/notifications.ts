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

export interface NotifyInput {
  /** `post_published`, `post_failed`, `channel_disconnected`. */
  type: string;
  title: string;
  body?: string;
  href?: string;
  /** Also send an email. Reserved for things that need acting on. */
  email?: boolean;
  /** Who to tell. Defaults to the person the context belongs to. */
  userId?: string;
}

/**
 * Tells someone something happened.
 *
 * In-app always; email only when the thing needs them to act — a post that
 * failed, a Page that stopped working. Email about every successful post and
 * people stop reading the ones that matter.
 */
export async function notify(ctx: Context, input: NotifyInput): Promise<void> {
  const userId = input.userId ?? ctx.userId;

  const notification = await ctx.db.notification.create({
    data: {
      workspaceId: ctx.workspaceId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    },
    select: { id: true },
  });

  if (!input.email) return;

  // The address lives on the user, which isn't workspace-owned.
  const { getUnscopedDb } = await import('@dpost/db');
  const user = await getUnscopedDb().user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return;

  const { sendEmail } = await import('../email/send');
  const { notificationEmail } = await import('../email/templates');
  const { getServerEnv } = await import('@dpost/config');
  const appUrl = getServerEnv().APP_URL;

  const message = notificationEmail({
    name: user.name,
    title: input.title,
    body: input.body ?? '',
    actionUrl: input.href ? `${appUrl}${input.href}` : appUrl,
  });

  try {
    await sendEmail({ to: user.email, ...message });
    await ctx.db.notification.update({
      where: { id: notification.id },
      data: { emailedAt: new Date() },
    });
  } catch {
    // The in-app notification is already saved: a mail server problem must
    // not lose the fact that something needs attention.
  }
}
