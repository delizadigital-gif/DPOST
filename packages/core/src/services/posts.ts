import type { ContentType, PostSource, PostStatus, Prisma, RevisionKind } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { validatePost } from '../social/facebook/validate';
import { normaliseHashtags, type ContentLanguageCode } from '../ai/schemas';
import {
  assertTransition,
  isEditable,
  statusAfterEdit,
  StatusTransitionError,
} from '../content/status';
import { recordAudit } from './audit';

/**
 * Everything that happens to a post after it is written: editing (which
 * keeps a revision), approving, duplicating, archiving and bringing back.
 *
 * Three rules hold throughout:
 * - **Nothing is destroyed.** Deleting sets `deletedAt`, and every edit
 *   snapshots what was there before, so "undo" is always available.
 * - **Status changes go through the machine** in `content/status.ts`, so no
 *   screen or AI tool can invent a path.
 * - **A post that could never be published can't be saved**, because the
 *   platform rules run on every write.
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
  plannedFor: Date | null;
  aiMeta: Prisma.JsonValue | null;
  approvedAt: Date | null;
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
  plannedFor: true,
  aiMeta: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Bulk actions are capped so one request can't lock the table for everyone. */
export const MAX_BULK_POSTS = 200;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

/** Turns a status-machine refusal into an error the API can return. */
function asAppError(error: unknown): never {
  if (error instanceof StatusTransitionError) {
    throw new AppError('CONFLICT', { message: error.message, cause: error });
  }
  throw error;
}

async function loadPost(ctx: Context, id: string) {
  const post = await ctx.db.contentPost.findFirst({
    where: { id, deletedAt: null },
    select: SUMMARY_SELECT,
  });
  if (!post) throw new AppError('NOT_FOUND', { message: "That post doesn't exist." });
  return post as PostSummary;
}

export interface CreatePostInput {
  body: string;
  hashtags?: string[];
  cta?: string | null;
  title?: string | null;
  language?: ContentLanguageCode;
  contentType?: ContentType | null;
  source?: PostSource;
  status?: PostStatus;
  plannedFor?: Date | null;
  /** Model, prompt version and any quality warnings, for AI-written posts. */
  aiMeta?: Prisma.InputJsonValue;
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
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
      plannedFor: input.plannedFor ?? null,
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
  plannedFor?: Date | null;
}

/**
 * Edits a post and keeps what it said before.
 *
 * The snapshot is written in the same transaction as the change, so a
 * revision can never be missing for an edit that happened — that is the
 * whole basis of undo.
 */
export async function updatePost(
  ctx: Context,
  id: string,
  input: UpdatePostInput,
  kind: RevisionKind = 'edit',
  instruction?: string,
): Promise<PostSummary> {
  assertCan(ctx.role, 'post:update');

  const existing = await loadPost(ctx, id);
  if (!isEditable(existing.status)) {
    throw new AppError('CONFLICT', {
      message: 'This post is archived. Restore it before editing.',
    });
  }

  const body = input.body?.trim() ?? existing.body;
  const hashtags = input.hashtags ? normaliseHashtags(input.hashtags) : existing.hashtags;
  assertPublishable(body, hashtags);

  const nextStatus = statusAfterEdit(existing.status);
  try {
    assertTransition(existing.status, nextStatus);
  } catch (error) {
    asAppError(error);
  }

  const changed =
    body !== existing.body ||
    JSON.stringify(hashtags) !== JSON.stringify(existing.hashtags) ||
    (input.cta !== undefined && (input.cta?.trim() || null) !== existing.cta);

  const post = await ctx.db.$transaction(async (tx) => {
    // Only a real change earns a revision: re-saving the same text should
    // not fill the history with versions that say nothing.
    if (changed) {
      await tx.postRevision.create({
        data: {
          workspaceId: ctx.workspaceId,
          postId: id,
          kind,
          body: existing.body,
          hashtags: existing.hashtags,
          cta: existing.cta,
          instruction: instruction ?? null,
          createdById: ctx.userId,
        },
      });
    }

    return tx.contentPost.update({
      where: { id },
      data: {
        body,
        hashtags,
        status: nextStatus,
        // An edit withdraws approval, so the record of who approved what goes too.
        approvedAt: null,
        approvedById: null,
        ...(input.cta === undefined ? {} : { cta: input.cta?.trim() || null }),
        ...(input.title === undefined ? {} : { title: input.title?.trim() || null }),
        ...(input.language ? { language: input.language } : {}),
        ...(input.plannedFor === undefined ? {} : { plannedFor: input.plannedFor }),
      },
      select: SUMMARY_SELECT,
    });
  });

  await recordAudit(ctx, {
    action: 'post.update',
    targetType: 'content_post',
    targetId: id,
    metadata: { kind, status: nextStatus },
  });

  return post as PostSummary;
}

export async function getPost(ctx: Context, id: string): Promise<PostSummary> {
  assertCan(ctx.role, 'post:read');
  return loadPost(ctx, id);
}

export interface ListPostsFilters {
  status?: PostStatus[];
  language?: ContentLanguageCode[];
  source?: PostSource[];
  /** Free text, matched against the post body and title. */
  search?: string;
  /** Planned-for window, used by the calendar. */
  from?: Date;
  to?: Date;
  /** Only posts with (or without) a planned date. */
  scheduled?: boolean;
  includeArchived?: boolean;
  limit?: number;
  /** Id of the last post on the previous page. */
  cursor?: string;
  orderBy?: 'updatedAt' | 'plannedFor' | 'createdAt';
}

export interface PostPage {
  posts: PostSummary[];
  /** Pass back as `cursor` for the next page; null when the list is done. */
  nextCursor: string | null;
  /** Total matching posts, for "12 of 240". */
  total: number;
}

function buildWhere(filters: ListPostsFilters): Prisma.ContentPostWhereInput {
  const where: Prisma.ContentPostWhereInput = {
    deletedAt: null,
  };

  if (!filters.includeArchived) where.status = { not: 'archived' };
  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.language?.length) where.language = { in: filters.language };
  if (filters.source?.length) where.source = { in: filters.source };

  if (filters.from || filters.to) {
    where.plannedFor = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    };
  } else if (filters.scheduled === true) {
    where.plannedFor = { not: null };
  } else if (filters.scheduled === false) {
    where.plannedFor = null;
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { body: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

/** The content list and the calendar are the same query with different filters. */
export async function listPosts(ctx: Context, filters: ListPostsFilters = {}): Promise<PostPage> {
  assertCan(ctx.role, 'post:read');

  const take = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const where = buildWhere(filters);
  const orderBy: Prisma.ContentPostOrderByWithRelationInput[] =
    filters.orderBy === 'plannedFor'
      ? [{ plannedFor: 'asc' }, { createdAt: 'asc' }]
      : [{ [filters.orderBy ?? 'updatedAt']: 'desc' }, { id: 'desc' }];

  const [posts, total] = await Promise.all([
    ctx.db.contentPost.findMany({
      where,
      orderBy,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: SUMMARY_SELECT,
    }),
    ctx.db.contentPost.count({ where }),
  ]);

  const page = posts.slice(0, take) as PostSummary[];
  return {
    posts: page,
    nextCursor: posts.length > take ? (page.at(-1)?.id ?? null) : null,
    total,
  };
}

/** Every post in a calendar window, in time order. No paging: a month fits. */
export async function listPostsInRange(
  ctx: Context,
  from: Date,
  to: Date,
  filters: Omit<ListPostsFilters, 'from' | 'to' | 'cursor' | 'limit'> = {},
): Promise<PostSummary[]> {
  const { posts } = await listPosts(ctx, {
    ...filters,
    from,
    to,
    orderBy: 'plannedFor',
    limit: MAX_PAGE_SIZE,
  });
  return posts;
}

export async function approvePost(ctx: Context, id: string): Promise<PostSummary> {
  assertCan(ctx.role, 'post:approve');
  const existing = await loadPost(ctx, id);

  try {
    assertTransition(existing.status, 'approved');
  } catch (error) {
    asAppError(error);
  }

  const post = await ctx.db.contentPost.update({
    where: { id },
    data: { status: 'approved', approvedAt: new Date(), approvedById: ctx.userId },
    select: SUMMARY_SELECT,
  });

  await recordAudit(ctx, { action: 'post.approve', targetType: 'content_post', targetId: id });
  return post as PostSummary;
}

export interface BulkResult {
  /** How many posts the action actually changed. */
  changed: number;
  /** Ids that were skipped, with why — a bulk action never fails silently. */
  skipped: { id: string; reason: string }[];
}

/**
 * Approves many posts at once, skipping the ones that can't be approved
 * rather than failing the whole batch. Approving 40 posts and being told
 * "one of them is archived" would be worse than useless.
 */
export async function approvePosts(ctx: Context, ids: string[]): Promise<BulkResult> {
  assertCan(ctx.role, 'post:approve');
  if (ids.length > MAX_BULK_POSTS) {
    throw new AppError('VALIDATION', {
      message: `Up to ${MAX_BULK_POSTS} posts at a time.`,
    });
  }

  const posts = await ctx.db.contentPost.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, status: true },
  });

  const found = new Set(posts.map((post) => post.id));
  const skipped = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: 'not found' }));

  const approvable: string[] = [];
  for (const post of posts) {
    if (post.status === 'approved') {
      skipped.push({ id: post.id, reason: 'already approved' });
    } else if (post.status === 'archived') {
      skipped.push({ id: post.id, reason: 'archived' });
    } else {
      approvable.push(post.id);
    }
  }

  const { count } = await ctx.db.contentPost.updateMany({
    where: { id: { in: approvable } },
    data: { status: 'approved', approvedAt: new Date(), approvedById: ctx.userId },
  });

  if (count > 0) {
    await recordAudit(ctx, {
      action: 'post.approve.bulk',
      targetType: 'content_post',
      metadata: { count, skipped: skipped.length },
    });
  }

  return { changed: count, skipped };
}

/** A copy to work from, always as a fresh draft. */
export async function duplicatePost(ctx: Context, id: string): Promise<PostSummary> {
  assertCan(ctx.role, 'post:create');
  const existing = await loadPost(ctx, id);

  const copy = await ctx.db.contentPost.create({
    data: {
      workspaceId: ctx.workspaceId,
      body: existing.body,
      hashtags: existing.hashtags,
      cta: existing.cta,
      title: existing.title,
      language: existing.language,
      contentType: existing.contentType,
      status: 'draft',
      source: existing.source,
      createdById: ctx.userId,
      // A copy is deliberately unscheduled: two posts at the same minute is
      // never what someone means by "duplicate".
      plannedFor: null,
    },
    select: SUMMARY_SELECT,
  });

  await recordAudit(ctx, {
    action: 'post.duplicate',
    targetType: 'content_post',
    targetId: copy.id,
    metadata: { from: id },
  });
  return copy as PostSummary;
}

/**
 * Soft delete: the row stays, with `deletedAt` set, so the undo in the toast
 * is a real undo rather than a re-creation that loses the post's history.
 */
export async function deletePost(ctx: Context, id: string): Promise<void> {
  assertCan(ctx.role, 'post:delete');
  await loadPost(ctx, id);

  await ctx.db.contentPost.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit(ctx, { action: 'post.delete', targetType: 'content_post', targetId: id });
}

export async function deletePosts(ctx: Context, ids: string[]): Promise<BulkResult> {
  assertCan(ctx.role, 'post:delete');
  if (ids.length > MAX_BULK_POSTS) {
    throw new AppError('VALIDATION', { message: `Up to ${MAX_BULK_POSTS} posts at a time.` });
  }

  const { count } = await ctx.db.contentPost.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (count > 0) {
    await recordAudit(ctx, {
      action: 'post.delete.bulk',
      targetType: 'content_post',
      metadata: { count },
    });
  }
  return { changed: count, skipped: [] };
}

export async function restorePost(ctx: Context, id: string): Promise<PostSummary> {
  assertCan(ctx.role, 'post:delete');

  const { count } = await ctx.db.contentPost.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (count === 0) {
    throw new AppError('NOT_FOUND', { message: 'That post is not in the bin.' });
  }

  await recordAudit(ctx, { action: 'post.restore', targetType: 'content_post', targetId: id });
  return loadPost(ctx, id);
}

export async function restorePosts(ctx: Context, ids: string[]): Promise<BulkResult> {
  assertCan(ctx.role, 'post:delete');
  const { count } = await ctx.db.contentPost.updateMany({
    where: { id: { in: ids.slice(0, MAX_BULK_POSTS) }, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (count > 0) {
    await recordAudit(ctx, {
      action: 'post.restore.bulk',
      targetType: 'content_post',
      metadata: { count },
    });
  }
  return { changed: count, skipped: [] };
}

export interface RevisionSummary {
  id: string;
  kind: RevisionKind;
  body: string;
  hashtags: string[];
  cta: string | null;
  instruction: string | null;
  createdAt: Date;
}

export async function listRevisions(
  ctx: Context,
  postId: string,
  limit = 20,
): Promise<RevisionSummary[]> {
  assertCan(ctx.role, 'post:read');
  await loadPost(ctx, postId);

  return ctx.db.postRevision.findMany({
    where: { postId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
    select: {
      id: true,
      kind: true,
      body: true,
      hashtags: true,
      cta: true,
      instruction: true,
      createdAt: true,
    },
  });
}

/**
 * Puts an earlier version back. The restore is itself an edit, so the
 * version being replaced is snapshotted too — you can undo an undo.
 */
export async function restoreRevision(
  ctx: Context,
  postId: string,
  revisionId: string,
): Promise<PostSummary> {
  assertCan(ctx.role, 'post:update');

  const revision = await ctx.db.postRevision.findFirst({
    where: { id: revisionId, postId },
    select: { body: true, hashtags: true, cta: true },
  });
  if (!revision) throw new AppError('NOT_FOUND', { message: "That version doesn't exist." });

  return updatePost(ctx, postId, {
    body: revision.body,
    hashtags: revision.hashtags,
    cta: revision.cta,
  });
}

/** Counts by status, for the filter chips above the list. */
export async function countPostsByStatus(ctx: Context): Promise<Record<string, number>> {
  assertCan(ctx.role, 'post:read');
  const rows = await ctx.db.contentPost.groupBy({
    by: ['status'],
    where: { workspaceId: ctx.workspaceId, deletedAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}
