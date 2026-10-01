import { listChannels } from '@dpost/core';
import { route } from '@/lib/api/route';

export const GET = route(
  { auth: 'member', permission: 'social:read', rateLimit: 'read' },
  ({ ctx }) => listChannels(ctx),
);
