import { restorePost } from '@dpost/core';
import { route } from '@/lib/api/route';

/** The undo behind the "Deleted — Undo" toast. */
export const POST = route(
  { auth: 'member', permission: 'post:delete', rateLimit: 'mutation' },
  ({ ctx, params }) => restorePost(ctx, String(params.id)),
);
