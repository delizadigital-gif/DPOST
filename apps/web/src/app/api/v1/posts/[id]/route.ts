import { z } from 'zod';
import { CONTENT_LANGUAGES, deletePost, getPost, updatePost } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  body: z.string().trim().min(1).max(3000).optional(),
  hashtags: z.array(z.string().max(40)).max(12).optional(),
  cta: z.string().max(160).nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  language: z.enum(CONTENT_LANGUAGES).optional(),
  plannedFor: z.iso.datetime().nullable().optional(),
});

export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read' },
  ({ ctx, params }) => getPost(ctx, String(params.id)),
);

/** Every edit keeps the previous version, so this is never destructive. */
export const PATCH = route(
  { auth: 'member', permission: 'post:update', rateLimit: 'mutation', body },
  ({ ctx, params, body }) => {
    const { plannedFor, ...rest } = body;
    return updatePost(ctx, String(params.id), {
      ...rest,
      ...(plannedFor === undefined ? {} : { plannedFor: plannedFor ? new Date(plannedFor) : null }),
    });
  },
);

/** Soft delete: the post is hidden, and `/restore` brings it back. */
export const DELETE = route(
  { auth: 'member', permission: 'post:delete', rateLimit: 'mutation' },
  async ({ ctx, params }) => {
    await deletePost(ctx, String(params.id));
    return { deleted: true };
  },
);
