'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Check, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth/client';

const THEMES = [
  { value: 'light', icon: Sun, labelKey: 'shell.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'shell.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'shell.themeSystem' },
] as const;

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const initials =
    name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'D';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.account')}
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" aria-hidden />
            {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('shell.theme')}
        </DropdownMenuLabel>
        {THEMES.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)}>
            <option.icon className="size-4" aria-hidden />
            {t(option.labelKey)}
            {theme === option.value ? <Check className="ml-auto size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={async (event) => {
            event.preventDefault();
            setSigningOut(true);
            await authClient.signOut();
            router.replace('/login');
            router.refresh();
          }}
        >
          <LogOut className="size-4" aria-hidden />
          {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
