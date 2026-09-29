import { z } from 'zod';
import { CONTENT_LANGUAGES, REWRITE_ACTIONS, rewriteDraft } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  action: z.enum(REWRITE_ACTIONS),
  body: z.string().trim().min(1).max(3000),
  hashtags: z.array(z.string().max(40)).max(12).default([]),
  cta: z.string().max(160).nullable().default(null),
  language: z.enum(CONTENT_LANGUAGES),
});

/** One editing action on the post the user is looking at. */
export const POST = route(
  { auth: 'member', permission: 'ai:use', rateLimit: 'ai', body },
  ({ ctx, body }) => rewriteDraft(ctx, body),
);
