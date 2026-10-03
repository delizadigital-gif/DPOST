import { z } from 'zod';
import { generatePostImage } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  /** The post the image is for; the AI writes the brief from it. */
  postBody: z.string().trim().min(1).max(3000),
  aspect: z.enum(['1:1', '4:5', '16:9']).default('1:1'),
  /** A description typed by the user, instead of the AI writing one. */
  prompt: z.string().trim().max(600).optional(),
});

/**
 * Makes an image for a post and puts it in the library. Counts against the
 * plan's image allowance, which is separate from posts because an image
 * costs several times what a caption does.
 */
export const POST = route(
  { auth: 'member', permission: 'ai:use', rateLimit: 'ai', body },
  ({ ctx, body }) => generatePostImage(ctx, body),
);
