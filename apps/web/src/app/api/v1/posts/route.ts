import { z } from 'zod';
import {
  CONTENT_LANGUAGES,
  CONTENT_TYPES,
  createPost,
  listPosts,
  POST_STATUSES,
} from '@dpost/core';
import { route } from '@/lib/api/route';

/** Comma-separated query values: `?status=draft,approved`. */
const commaList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((raw) => raw?.split(',').filter(Boolean) ?? [])
    .pipe(z.array(z.enum(values)));

const query = z.object({
  status: commaList(POST_STATUSES),
  language: commaList(CONTENT_LANGUAGES),
  source: commaList(['manual', 'ai_single', 'ai_plan', 'ai_chat'] as const),
  q: z.string().trim().max(200).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

const body = z.object({
  body: z.string().trim().min(1).max(3000),
  hashtags: z.array(z.string().max(40)).max(12).default([]),
  cta: z.string().max(160).nullable().default(null),
  title: z.string().max(120).nullable().default(null),
  language: z.enum(CONTENT_LANGUAGES).default('en'),
  contentType: z.enum(CONTENT_TYPES).nullable().default(null),
  source: z.enum(['manual', 'ai_single']).default('manual'),
  plannedFor: z.iso.datetime().nullable().default(null),
  /** Model and prompt version for an AI-written draft, kept with the post. */
  aiMeta: z.record(z.string(), z.unknown()).nullable().default(null),
});

/** The content list and the calendar both read from here. */
export const GET = route(
  { auth: 'member', permission: 'post:read', rateLimit: 'read', query },
  ({ ctx, query }) =>
    listPosts(ctx, {
      status: query.status,
      language: query.language,
      source: query.source,
      ...(query.q ? { search: query.q } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      includeArchived: query.includeArchived === 'true',
    }),
);

export const POST = route(
  { auth: 'member', permission: 'post:create', rateLimit: 'mutation', body },
  ({ ctx, body }) => {
    const { aiMeta, plannedFor, ...post } = body;
    return createPost(ctx, {
      ...post,
      plannedFor: plannedFor ? new Date(plannedFor) : null,
      ...(aiMeta ? { aiMeta: aiMeta as Record<string, never> } : {}),
    });
  },
);
