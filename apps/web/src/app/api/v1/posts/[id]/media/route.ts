import { z } from 'zod';
import { listPostMedia, MAX_MEDIA_PER_POST, setPostMedia } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  /** The whole set, in the order they should appear. */
  mediaIds: z.array(z.uuid()).max(MAX_MEDIA_PER_POST),
});

export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read' },
  ({ ctx, params }) => listPostMedia(ctx, String(params.id)),
);

export const PUT = route(
  { auth: 'member', permission: 'post:update', rateLimit: 'mutation', body },
  ({ ctx, params, body }) => setPostMedia(ctx, String(params.id), body.mediaIds),
);
