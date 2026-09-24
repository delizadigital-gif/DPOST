import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensurePersonalWorkspace } from '@dpost/core';
import { Logo } from '@/components/brand/logo';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Toaster } from '@/components/ui/sonner';
import { getCurrentSession } from '@/lib/auth/session';

/**
 * Every signed-in page lives under this layout. It is the real access check
 * (proxy.ts only does a quick cookie check), and it makes sure the user has
 * a workspace, repairing it if workspace creation failed at sign-up.
 * The full app shell (sidebar, navigation) is built in Phase 4.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  await ensurePersonalWorkspace(session.userId, session.name);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/home" aria-label="DPOST home">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
