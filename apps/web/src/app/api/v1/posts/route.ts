import { z } from 'zod';
import { CONTENT_LANGUAGES, CONTENT_TYPES, createPost, listRecentPosts } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  body: z.string().trim().min(1).max(3000),
  hashtags: z.array(z.string().max(40)).max(12).default([]),
  cta: z.string().max(160).nullable().default(null),
  title: z.string().max(120).nullable().default(null),
  language: z.enum(CONTENT_LANGUAGES).default('en'),
  contentType: z.enum(CONTENT_TYPES).nullable().default(null),
  source: z.enum(['manual', 'ai_single']).default('manual'),
  /** Model and prompt version for an AI-written draft, kept with the post. */
  aiMeta: z.record(z.string(), z.unknown()).nullable().default(null),
});

export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read' },
  ({ ctx }) => listRecentPosts(ctx),
);

export const POST = route(
  { auth: 'member', permission: 'post:create', rateLimit: 'mutation', body },
  ({ ctx, body }) => {
    const { aiMeta, ...post } = body;
    return createPost(ctx, {
      ...post,
      ...(aiMeta ? { aiMeta: aiMeta as Record<string, never> } : {}),
    });
  },
);
