import type { ContentType, PostSource, PostStatus, Prisma } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { validatePost } from '../social/facebook/validate';
import { normaliseHashtags, type ContentLanguageCode } from '../ai/schemas';
import { recordAudit } from './audit';

/**
 * Saving posts. Phase 6 needs only what the composer does — create a draft,
 * change it, read it back — and Phase 7 builds the rest of content
 * management (approval, revisions, soft delete, bulk actions) on top.
 *
 * Every post is validated against the platform's rules before it is stored,
 * so a draft that could never be published can't be saved and forgotten.
 */

export interface PostSummary {
  id: string;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  language: ContentLanguageCode;
  contentType: ContentType | null;
  status: PostStatus;
  source: PostSource;
  aiMeta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

const SUMMARY_SELECT = {
  id: true,
  title: true,
  body: true,
  hashtags: true,
  cta: true,
  language: true,
  contentType: true,
  status: true,
  source: true,
  aiMeta: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreatePostInput {
  body: string;
  hashtags?: string[];
  cta?: string | null;
  title?: string | null;
  language?: ContentLanguageCode;
  contentType?: ContentType | null;
  source?: PostSource;
  /** Model, prompt version and any quality warnings, for AI-written posts. */
  aiMeta?: Prisma.InputJsonValue;
}

function assertPublishable(body: string, hashtags: string[]): void {
  const { ok, issues } = validatePost({ body, hashtags });
  if (!ok) {
    throw new AppError('VALIDATION', {
      message:
        issues.find((issue) => issue.level === 'error')?.message ?? 'This post is not valid.',
      details: { issues },
    });
  }
}

export async function createPost(ctx: Context, input: CreatePostInput): Promise<PostSummary> {
  assertCan(ctx.role, 'post:create');

  const body = input.body.trim();
  const hashtags = normaliseHashtags(input.hashtags ?? []);
  assertPublishable(body, hashtags);

  const post = await ctx.db.contentPost.create({
    data: {
      workspaceId: ctx.workspaceId,
      body,
      hashtags,
      cta: input.cta?.trim() || null,
      title: input.title?.trim() || null,
      language: input.language ?? 'en',
      contentType: input.contentType ?? null,
      status: 'draft',
      source: input.source ?? 'manual',
      createdById: ctx.userId,
      ...(input.aiMeta === undefined ? {} : { aiMeta: input.aiMeta }),
    },
    select: SUMMARY_SELECT,
  });

  await recordAudit(ctx, {
    action: 'post.create',
    targetType: 'content_post',
    targetId: post.id,
    metadata: { source: post.source, language: post.language },
  });

  return post as PostSummary;
}

export interface UpdatePostInput {
  body?: string;
  hashtags?: string[];
  cta?: string | null;
  title?: string | null;
  language?: ContentLanguageCode;
}

export async function updatePost(
  ctx: Context,
  id: string,
  input: UpdatePostInput,
): Promise<PostSummary> {
  assertCan(ctx.role, 'post:update');

  const existing = await ctx.db.contentPost.findFirst({
    where: { id, deletedAt: null },
    select: SUMMARY_SELECT,
  });
  if (!existing) throw new AppError('NOT_FOUND', { message: "That post doesn't exist." });

  const body = input.body?.trim() ?? existing.body;
  const hashtags = input.hashtags ? normaliseHashtags(input.hashtags) : existing.hashtags;
  assertPublishable(body, hashtags);

  const post = await ctx.db.contentPost.update({
    where: { id },
    data: {
      body,
      hashtags,
      ...(input.cta === undefined ? {} : { cta: input.cta?.trim() || null }),
      ...(input.title === undefined ? {} : { title: input.title?.trim() || null }),
      ...(input.language ? { language: input.language } : {}),
    },
    select: SUMMARY_SELECT,
  });

  await recordAudit(ctx, {
    action: 'post.update',
    targetType: 'content_post',
    targetId: post.id,
  });

  return post as PostSummary;
}

export async function getPost(ctx: Context, id: string): Promise<PostSummary> {
  assertCan(ctx.role, 'post:read');
  const post = await ctx.db.contentPost.findFirst({
    where: { id, deletedAt: null },
    select: SUMMARY_SELECT,
  });
  if (!post) throw new AppError('NOT_FOUND', { message: "That post doesn't exist." });
  return post as PostSummary;
}

/** The most recent drafts, for the list beside the composer. */
export async function listRecentPosts(ctx: Context, limit = 20): Promise<PostSummary[]> {
  assertCan(ctx.role, 'post:read');
  const posts = await ctx.db.contentPost.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(limit, 50),
    select: SUMMARY_SELECT,
  });
  return posts as PostSummary[];
}
