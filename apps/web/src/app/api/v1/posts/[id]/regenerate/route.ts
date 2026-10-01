import { z } from 'zod';
import { regeneratePost } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  /** "Make it shorter", "mention free delivery" — optional. */
  instruction: z.string().trim().max(500).optional(),
});

/** Rewrites a saved post. The previous version is kept as a revision. */
export const POST = route(
  { auth: 'member', permission: 'ai:use', rateLimit: 'ai', body },
  ({ ctx, params, body }) => regeneratePost(ctx, String(params.id), body.instruction),
);
