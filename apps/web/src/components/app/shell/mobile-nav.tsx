'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { activeHref, MOBILE_ITEMS, NAV_GROUPS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Phone navigation: the four most-used sections as a bottom tab bar, with the
 * AI assistant raised in the middle, and everything else in a "More" sheet.
 */
export function MobileNav({ children }: { children?: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const current = activeHref(pathname);
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {MOBILE_ITEMS.map((item) => {
          const isActive = current === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg',
                    item.spark && 'bg-spark text-white',
                    isActive && !item.spark && 'bg-accent',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                </span>
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground">
              <span className="flex size-8 items-center justify-center rounded-lg">
                <Menu className="size-4" aria-hidden />
              </span>
              {t('nav.more')}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t('nav.more')}</SheetTitle>
                <SheetDescription className="sr-only">All sections of DPOST</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                {NAV_GROUPS.map((group) => (
                  <div key={group.labelKey}>
                    <p className="pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t(group.labelKey)}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            aria-current={current === item.href ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                              current === item.href
                                ? 'bg-accent text-accent-foreground'
                                : 'text-foreground',
                            )}
                          >
                            <item.icon className="size-4 shrink-0" aria-hidden />
                            {t(item.labelKey)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="border-t border-border pt-4">{children}</div>
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
