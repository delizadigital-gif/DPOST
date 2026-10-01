import { z } from 'zod';
import { publishNow } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({ channelId: z.uuid() });

/**
 * Publishes straight away — through the same queue as everything else, so
 * there is only one publishing path to get right.
 */
export const POST = route(
  { auth: 'member', permission: 'post:publish', rateLimit: 'publishNow', body },
  ({ ctx, params, body }) =>
    publishNow(ctx, { postId: String(params.id), channelId: body.channelId }),
);
