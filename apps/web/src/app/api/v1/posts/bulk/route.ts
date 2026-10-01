import { z } from 'zod';
import { approvePosts, deletePosts, MAX_BULK_POSTS, restorePosts } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_BULK_POSTS),
  action: z.enum(['approve', 'delete', 'restore']),
});

/**
 * One endpoint for the list's bulk actions. Each answers with what it
 * changed and what it skipped, so the interface can say "38 approved, 2 were
 * archived" instead of claiming everything worked.
 */
export const POST = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'mutation', body },
  ({ ctx, body }) => {
    switch (body.action) {
      case 'approve':
        return approvePosts(ctx, body.ids);
      case 'delete':
        return deletePosts(ctx, body.ids);
      case 'restore':
        return restorePosts(ctx, body.ids);
    }
  },
);
