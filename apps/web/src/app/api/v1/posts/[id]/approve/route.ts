import { approvePost } from '@dpost/core';
import { route } from '@/lib/api/route';

export const POST = route(
  { auth: 'member', permission: 'post:approve', rateLimit: 'mutation' },
  ({ ctx, params }) => approvePost(ctx, String(params.id)),
);
