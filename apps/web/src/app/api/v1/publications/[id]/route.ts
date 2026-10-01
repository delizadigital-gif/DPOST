import { unschedulePost } from '@dpost/core';
import { route } from '@/lib/api/route';

/** Takes a post out of the queue. The post itself stays as it is. */
export const DELETE = route(
  { auth: 'member', permission: 'post:schedule', rateLimit: 'mutation' },
  async ({ ctx, params }) => {
    await unschedulePost(ctx, String(params.id));
    return { unscheduled: true };
  },
);
