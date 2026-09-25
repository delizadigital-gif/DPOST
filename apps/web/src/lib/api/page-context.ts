import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createContext, ensurePersonalWorkspace, type Context } from '@dpost/core';
import { getCurrentSession } from '@/lib/auth/session';

/**
 * The workspace context for a page render. Cached per request, so a layout
 * and the page inside it share one membership lookup.
 *
 * Pages use this instead of building a context by hand: it is the same
 * `createContext` every API route and background job uses, so a page can't
 * end up with weaker checks than the API behind it.
 */
export const getPageContext = cache(async (): Promise<Context> => {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const workspaceId = await ensurePersonalWorkspace(session.userId, session.name);
  return createContext({
    userId: session.userId,
    workspaceId: session.activeWorkspaceId ?? workspaceId,
    emailVerified: session.emailVerified,
    source: 'web',
  });
});
