import { duplicatePost } from '@dpost/core';
import { route } from '@/lib/api/route';

export const POST = route(
  { auth: 'member', permission: 'post:create', rateLimit: 'mutation' },
  ({ ctx, params }) => duplicatePost(ctx, String(params.id)),
);
