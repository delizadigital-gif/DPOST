import { restoreRevision } from '@dpost/core';
import { route } from '@/lib/api/route';

/** Puts an earlier version back; the one it replaces is kept too. */
export const POST = route(
  { auth: 'member', permission: 'post:update', rateLimit: 'mutation' },
  ({ ctx, params }) => restoreRevision(ctx, String(params.id), String(params.revisionId)),
);
