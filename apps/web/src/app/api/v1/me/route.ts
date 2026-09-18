import { getMe } from '@dpost/core';
import { route } from '@/lib/api/route';

export const GET = route(
  { auth: 'member', permission: 'workspace:read', rateLimit: 'read' },
  ({ ctx }) => getMe(ctx),
);
