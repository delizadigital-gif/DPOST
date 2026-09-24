import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

export const LEGAL_LAST_UPDATED = '19 September 2026';
export const OPERATOR = 'DelizaDigital';

/** The contact address, or a visible placeholder so a missing value gets noticed. */
export function contactEmail(): string {
  return process.env.CONTACT_EMAIL || '[contact email not configured]';
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="DPOST home">
          <Logo />
        </Link>
        <nav className="flex gap-5 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/data-deletion" className="hover:text-foreground">
            Data deletion
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 pt-8 pb-24">
        <h1 className="text-4xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        <div className="mt-10 space-y-8 text-[15px] leading-7 text-foreground/90 [&_a]:text-primary [&_a]:underline [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
    </div>
  );
}
