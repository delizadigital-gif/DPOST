import { z } from 'zod';
import { deleteMedia, getMedia, updateMedia } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  altText: z.string().max(300).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const GET = route(
  { auth: 'member', permission: 'media:read', rateLimit: 'read' },
  ({ ctx, params }) => getMedia(ctx, String(params.id)),
);

export const PATCH = route(
  { auth: 'member', permission: 'media:upload', rateLimit: 'mutation', body },
  ({ ctx, params, body }) => updateMedia(ctx, String(params.id), body),
);

/** Refused while a scheduled or published post still needs the image. */
export const DELETE = route(
  { auth: 'member', permission: 'media:delete', rateLimit: 'mutation' },
  async ({ ctx, params }) => {
    await deleteMedia(ctx, String(params.id));
    return { deleted: true };
  },
);
