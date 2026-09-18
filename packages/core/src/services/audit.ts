import { getUnscopedDb, type ActorType, type Prisma } from '@dpost/db';
import type { Context } from '../context';

export interface AuditEntry {
  /** Dotted verb, e.g. `post.delete`, `channel.disconnect`. */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Summary of what changed. Never tokens, passwords or other secrets. */
  metadata?: Prisma.InputJsonObject;
}

function actorTypeFor(ctx: Context): ActorType {
  if (ctx.source === 'agent') return 'agent';
  if (ctx.source === 'worker') return 'system';
  return 'user';
}

/**
 * Appends to the audit log. Called by services after every mutation.
 * Uses the unscoped client because the audit table also holds
 * platform-level entries with no workspace.
 */
export async function recordAudit(ctx: Context, entry: AuditEntry): Promise<void> {
  await getUnscopedDb().auditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      actorType: actorTypeFor(ctx),
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ip: ctx.ip ?? null,
      requestId: ctx.requestId,
    },
  });
}
