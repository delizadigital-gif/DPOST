import { randomUUID } from 'node:crypto';
import { getTenantDb, getUnscopedDb, type TenantDb, type WorkspaceRole } from '@dpost/db';
import { AppError } from './lib/errors';

/** Where a call entered the system. Recorded in audit logs. */
export type RequestSource = 'web' | 'api' | 'agent' | 'worker';

/**
 * Everything a service needs to know about who is acting and for which
 * workspace. It is the first argument of every service function, and it is
 * built the same way for the UI, the API, the AI agent and the worker, so
 * authorization is identical across all of them.
 *
 * `workspaceId` always comes from the verified session or job, never from
 * request input or model output.
 */
export interface Context {
  requestId: string;
  source: RequestSource;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  /** Database client bound to `workspaceId`. */
  db: TenantDb;
  ip?: string;
}

export function newRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '')}`;
}

export interface CreateContextInput {
  userId: string;
  /** Preferred workspace (e.g. the session's active one). Falls back to the user's first. */
  workspaceId?: string | null;
  source: RequestSource;
  requestId?: string;
  ip?: string;
}

/**
 * Resolves the user's membership and returns a context for it. Fails with
 * FORBIDDEN if the user isn't a member of the requested workspace, which
 * covers a stale or tampered active-workspace value.
 */
export async function createContext(input: CreateContextInput): Promise<Context> {
  const db = getUnscopedDb();
  const membership = input.workspaceId
    ? await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        select: { workspaceId: true, role: true },
      })
    : await db.workspaceMember.findFirst({
        where: { userId: input.userId },
        orderBy: { createdAt: 'asc' },
        select: { workspaceId: true, role: true },
      });

  if (!membership) {
    throw new AppError(input.workspaceId ? 'FORBIDDEN' : 'NOT_FOUND', {
      message: input.workspaceId
        ? "You don't have access to this workspace."
        : "You don't belong to a workspace yet.",
    });
  }

  return {
    requestId: input.requestId ?? newRequestId(),
    source: input.source,
    userId: input.userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
    db: getTenantDb(membership.workspaceId),
    ...(input.ip ? { ip: input.ip } : {}),
  };
}
