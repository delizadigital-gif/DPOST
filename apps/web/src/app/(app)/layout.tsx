import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createContext, ensurePersonalWorkspace } from '@dpost/core';
import { Logo } from '@/components/brand/logo';
import { MobileNav } from '@/components/app/shell/mobile-nav';
import { PageTransition } from '@/components/app/page-transition';
import { NotificationBell } from '@/components/app/shell/notification-bell';
import { QuotaMeter } from '@/components/app/shell/quota-meter';
import { Sidebar } from '@/components/app/shell/sidebar';
import { UserMenu } from '@/components/app/shell/user-menu';
import { Toaster } from '@/components/ui/sonner';
import { getCurrentSession } from '@/lib/auth/session';

/**
 * The signed-in shell: sidebar on laptops and up, a tab bar on phones.
 * This layout is the real access check (proxy.ts only looks for a cookie),
 * and it makes sure the user has a workspace, repairing it if creation
 * failed during sign-up.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const workspaceId = await ensurePersonalWorkspace(session.userId, session.name);
  const ctx = await createContext({
    userId: session.userId,
    workspaceId: session.activeWorkspaceId ?? workspaceId,
    emailVerified: session.emailVerified,
    source: 'web',
  });

  const account = <UserMenu name={session.name} email={session.email} />;

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar>
        <div className="space-y-2">
          <QuotaMeter ctx={ctx} />
          {account}
        </div>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-canvas/85 px-4 backdrop-blur sm:px-6">
          <Link href="/home" aria-label="DPOST home" className="lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell ctx={ctx} />
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pb-12">
          <div className="mx-auto w-full max-w-5xl">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      <MobileNav>
        <div className="space-y-2">
          <QuotaMeter ctx={ctx} />
          {account}
        </div>
      </MobileNav>
      <Toaster position="top-center" />
    </div>
  );
}
