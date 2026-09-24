import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getAuth } from './server';

export interface SessionInfo {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** The workspace the user last switched to, if any. */
  activeWorkspaceId: string | null;
}

async function resolve(requestHeaders: Headers): Promise<SessionInfo | null> {
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const { user, session } = result;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    activeWorkspaceId: (session as { activeWorkspaceId?: string | null }).activeWorkspaceId ?? null,
  };
}

/** The signed-in user for an API request, or null. */
export async function getSession(request: Request): Promise<SessionInfo | null> {
  return resolve(request.headers);
}

/**
 * The signed-in user for the current page render, or null. Cached per
 * request, so layouts and pages can all call it without extra queries.
 */
export const getCurrentSession = cache(async (): Promise<SessionInfo | null> =>
  resolve(await headers()),
);
