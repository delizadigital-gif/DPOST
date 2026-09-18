import 'server-only';

export interface SessionInfo {
  userId: string;
  /** The workspace the user last switched to, if any. */
  activeWorkspaceId: string | null;
}

/**
 * Resolves the signed-in user from the request.
 *
 * Authentication arrives in Phase 3 (Better Auth). Until then there are no
 * sessions, so this always returns null and every protected API route
 * responds 401. Tests substitute their own session.
 */
export async function getSession(_request: Request): Promise<SessionInfo | null> {
  return null;
}
