import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Bell } from 'lucide-react';
import { listRecentNotifications, type Context } from '@dpost/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Bell with unread count. Reads real notifications; empty until Phase 8. */
export async function NotificationBell({ ctx }: { ctx: Context }) {
  const t = await getTranslations();
  const { items, unread } = await listRecentNotifications(ctx, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          unread > 0 ? `${t('nav.notifications')} (${unread} unread)` : t('nav.notifications')
        }
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Bell className="size-4.5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-coral text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t('nav.notifications')}</p>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">{t('shell.notificationsEmpty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('shell.notificationsEmptyBody')}
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href ?? '/notifications'}
                  className="block px-4 py-3 transition-colors hover:bg-muted"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.body ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border px-4 py-2.5">
          <Link href="/notifications" className="text-sm font-medium text-primary hover:underline">
            {t('shell.viewAll')}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
