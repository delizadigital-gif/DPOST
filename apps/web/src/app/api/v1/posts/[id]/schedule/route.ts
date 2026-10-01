import { z } from 'zod';
import { schedulePost } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  channelId: z.uuid(),
  /** When it should go out, in UTC. The interface converts from local time. */
  scheduledAt: z.iso.datetime(),
});

export const POST = route(
  { auth: 'member', permission: 'post:schedule', rateLimit: 'mutation', body },
  ({ ctx, params, body }) =>
    schedulePost(ctx, {
      postId: String(params.id),
      channelId: body.channelId,
      scheduledAt: new Date(body.scheduledAt),
    }),
);
