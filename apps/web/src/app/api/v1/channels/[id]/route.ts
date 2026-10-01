import { disconnectChannel } from '@dpost/core';
import { route } from '@/lib/api/route';

/** Disconnects a Page, and hands the permissions back if it was the last one. */
export const DELETE = route(
  { auth: 'member', permission: 'social:connect', rateLimit: 'mutation' },
  async ({ ctx, params }) => {
    await disconnectChannel(ctx, String(params.id));
    return { disconnected: true };
  },
);
