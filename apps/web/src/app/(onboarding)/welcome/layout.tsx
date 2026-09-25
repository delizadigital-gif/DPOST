import { redirect } from 'next/navigation';
import { createContext, ensurePersonalWorkspace, getOnboardingStatus } from '@dpost/core';
import { Logo } from '@/components/brand/logo';
import { getCurrentSession } from '@/lib/auth/session';
import { SkipSetup } from './skip-setup';

/**
 * The welcome wizard: full screen, no sidebar, nothing to click except the
 * question in front of you. Onboarding comes before connecting Facebook on
 * purpose — plenty of shop owners stall at Meta's login, and the AI is
 * already useful with just these answers (docs/01, "Journey design choices").
 */
export const dynamic = 'force-dynamic';

export default async function WelcomeLayout({ children }: LayoutProps<'/welcome'>) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const workspaceId = await ensurePersonalWorkspace(session.userId, session.name);
  const ctx = await createContext({
    userId: session.userId,
    workspaceId: session.activeWorkspaceId ?? workspaceId,
    emailVerified: session.emailVerified,
    source: 'web',
  });

  // Someone who already finished belongs in the Brand Brain, where the same
  // answers can be changed without pretending to be a first run.
  const { done } = await getOnboardingStatus(ctx);
  if (done) redirect('/brand');

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <SkipSetup />
      </header>
      <main className="flex flex-1 justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
