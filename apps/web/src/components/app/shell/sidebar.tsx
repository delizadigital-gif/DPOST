'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/logo';
import { activeHref, NAV_GROUPS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** Desktop navigation. Hidden below `lg`, where the tab bar takes over. */
export function Sidebar({ children }: { children?: React.ReactNode }) {
  const t = useTranslations();
  const current = activeHref(usePathname());

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/home" aria-label="DPOST home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p className="px-3 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(group.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = current === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-ink-600 hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <item.icon
                        className={cn('size-4 shrink-0', item.spark && !isActive && 'text-primary')}
                        aria-hidden
                      />
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">{children}</div>
    </aside>
  );
}
