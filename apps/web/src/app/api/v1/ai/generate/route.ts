import { z } from 'zod';
import { CONTENT_LANGUAGES, generateDrafts, MAX_DRAFTS_PER_REQUEST } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  /** What the owner asked for. Empty means "you choose". */
  request: z.string().trim().max(1000).default(''),
  language: z.enum(CONTENT_LANGUAGES),
  count: z.number().int().min(1).max(MAX_DRAFTS_PER_REQUEST),
});

/**
 * Writes up to five posts. Synchronous: a small batch takes a few seconds,
 * and waiting is simpler for everyone than a job to poll. Plans and their
 * hundreds of posts go through the worker instead (Phase 7).
 */
export const POST = route(
  { auth: 'member', permission: 'ai:use', rateLimit: 'ai', body },
  ({ ctx, body }) => generateDrafts(ctx, body),
);
