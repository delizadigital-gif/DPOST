import { listRevisions } from '@dpost/core';
import { route } from '@/lib/api/route';

export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read' },
  ({ ctx, params }) => listRevisions(ctx, String(params.id)),
);
