import { retryPublication } from '@dpost/core';
import { route } from '@/lib/api/route';

export const POST = route(
  { auth: 'member', permission: 'post:publish', rateLimit: 'mutation' },
  ({ ctx, params }) => retryPublication(ctx, String(params.id)),
);
