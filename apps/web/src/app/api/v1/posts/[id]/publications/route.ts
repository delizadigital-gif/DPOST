import { listPublications } from '@dpost/core';
import { route } from '@/lib/api/route';

/** What is queued, published or failed for this post. */
export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read' },
  ({ ctx, params }) => listPublications(ctx, String(params.id)),
);
