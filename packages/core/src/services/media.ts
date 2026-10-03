import { getStorageEnv } from '@dpost/config';
import type { MediaSource, Prisma } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { processImage } from '../media/process';
import { getStorage, mediaKey } from '../storage';
import { recordAudit } from './audit';

/**
 * The media library: uploading images, listing them, attaching them to posts
 * and letting them go.
 *
 * The one rule with teeth is at the end — an image attached to a post that
 * is scheduled or already published cannot be deleted. Facebook fetches the
 * file from us at publish time, and a library tidy-up should never turn
 * tonight's post into a broken image.
 */

export interface MediaSummary {
  id: string;
  source: MediaSource;
  status: string;
  url: string;
  thumbUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  filename: string | null;
  altText: string | null;
  tags: string[];
  prompt: string | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  source: true,
  status: true,
  storageKey: true,
  thumbKey: true,
  mimeType: true,
  width: true,
  height: true,
  bytes: true,
  filename: true,
  altText: true,
  tags: true,
  prompt: true,
  createdAt: true,
} as const;

type MediaRow = Prisma.MediaAssetGetPayload<{ select: typeof SELECT }>;

function toSummary(row: MediaRow): MediaSummary {
  const storage = getStorage();
  const { storageKey, thumbKey, ...rest } = row;
  return {
    ...rest,
    url: storageKey ? storage.publicUrl(storageKey) : '',
    thumbUrl: thumbKey ? storage.publicUrl(thumbKey) : null,
  };
}

export interface UploadMediaInput {
  bytes: Buffer;
  filename?: string | null;
  altText?: string | null;
  source?: MediaSource;
  /** Set for AI images: the prompt that produced it, and which provider. */
  prompt?: string | null;
  provider?: string | null;
}

/**
 * Takes an uploaded file and makes it part of the library.
 *
 * The row is written first, in `processing`, so a crash half-way leaves a
 * visible failure rather than an orphaned file in storage with nothing
 * pointing at it.
 */
export async function uploadMedia(ctx: Context, input: UploadMediaInput): Promise<MediaSummary> {
  assertCan(ctx.role, 'media:upload');

  const env = getStorageEnv();
  const asset = await ctx.db.mediaAsset.create({
    data: {
      workspaceId: ctx.workspaceId,
      source: input.source ?? 'upload',
      status: 'processing',
      kind: 'image',
      filename: input.filename?.slice(0, 200) ?? null,
      altText: input.altText?.slice(0, 300) ?? null,
      prompt: input.prompt ?? null,
      provider: input.provider ?? null,
      createdById: ctx.userId,
    },
    select: { id: true },
  });

  try {
    const processed = await processImage(input.bytes, {
      maxBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    });
    const storage = getStorage(env);

    const key = mediaKey(ctx.workspaceId, asset.id, 'original', processed.extension);
    const thumb = mediaKey(ctx.workspaceId, asset.id, 'thumb', 'webp');
    await storage.put(key, processed.image, processed.mimeType);
    await storage.put(thumb, processed.thumb, 'image/webp');

    const ready = await ctx.db.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        storageKey: key,
        thumbKey: thumb,
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      },
      select: SELECT,
    });

    await recordAudit(ctx, {
      action: 'media.upload',
      targetType: 'media_asset',
      targetId: asset.id,
      metadata: { source: ready.source, bytes: processed.bytes },
    });

    return toSummary(ready);
  } catch (error) {
    // The failure is recorded on the row, so the library can show it rather
    // than leaving an image that never appears.
    await ctx.db.mediaAsset.update({ where: { id: asset.id }, data: { status: 'failed' } });
    throw error;
  }
}

export interface ListMediaFilters {
  source?: MediaSource[];
  /** Matches the filename, the alt text and the prompt. */
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface MediaPage {
  media: MediaSummary[];
  nextCursor: string | null;
  total: number;
}

export async function listMedia(ctx: Context, filters: ListMediaFilters = {}): Promise<MediaPage> {
  assertCan(ctx.role, 'media:read');

  const take = Math.min(filters.limit ?? 40, 100);
  const search = filters.search?.trim();
  const where: Prisma.MediaAssetWhereInput = {
    deletedAt: null,
    status: 'ready',
    ...(filters.source?.length ? { source: { in: filters.source } } : {}),
    ...(search
      ? {
          OR: [
            { filename: { contains: search, mode: 'insensitive' } },
            { altText: { contains: search, mode: 'insensitive' } },
            { prompt: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    ctx.db.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: SELECT,
    }),
    ctx.db.mediaAsset.count({ where }),
  ]);

  const page = rows.slice(0, take);
  return {
    media: page.map(toSummary),
    nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
    total,
  };
}

export async function getMedia(ctx: Context, id: string): Promise<MediaSummary> {
  assertCan(ctx.role, 'media:read');
  const row = await ctx.db.mediaAsset.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  if (!row) throw new AppError('NOT_FOUND', { message: "That image isn't here." });
  return toSummary(row);
}

export interface UpdateMediaInput {
  altText?: string | null;
  tags?: string[];
}

export async function updateMedia(
  ctx: Context,
  id: string,
  input: UpdateMediaInput,
): Promise<MediaSummary> {
  assertCan(ctx.role, 'media:upload');
  const existing = await ctx.db.mediaAsset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('NOT_FOUND', { message: "That image isn't here." });

  const row = await ctx.db.mediaAsset.update({
    where: { id },
    data: {
      ...(input.altText === undefined ? {} : { altText: input.altText?.slice(0, 300) || null }),
      ...(input.tags
        ? {
            tags: input.tags
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 20),
          }
        : {}),
    },
    select: SELECT,
  });
  return toSummary(row);
}

/**
 * Removes an image from the library — unless a post that is scheduled or
 * already published uses it. Facebook fetches the file from us when the post
 * goes out, so deleting it would break a post the user still expects.
 */
export async function deleteMedia(ctx: Context, id: string): Promise<void> {
  assertCan(ctx.role, 'media:delete');

  const asset = await ctx.db.mediaAsset.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, storageKey: true, thumbKey: true },
  });
  if (!asset) throw new AppError('NOT_FOUND', { message: "That image isn't here." });

  const blocking = await ctx.db.publication.count({
    where: {
      status: { in: ['scheduled', 'publishing', 'published'] },
      post: { media: { some: { mediaId: id } } },
    },
  });
  if (blocking > 0) {
    throw new AppError('CONFLICT', {
      message:
        blocking === 1
          ? 'A scheduled or published post uses this image. Remove it from that post first.'
          : `${blocking} scheduled or published posts use this image. Remove it from them first.`,
    });
  }

  // Soft delete first: if the storage call fails, the image is already gone
  // from the library rather than half-deleted.
  await ctx.db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await ctx.db.postMedia.deleteMany({ where: { mediaId: id } });

  const storage = getStorage();
  await Promise.allSettled([
    asset.storageKey ? storage.delete(asset.storageKey) : Promise.resolve(),
    asset.thumbKey ? storage.delete(asset.thumbKey) : Promise.resolve(),
  ]);

  await recordAudit(ctx, { action: 'media.delete', targetType: 'media_asset', targetId: id });
}

/** The images on a post, in the order they will appear. */
export async function listPostMedia(ctx: Context, postId: string): Promise<MediaSummary[]> {
  assertCan(ctx.role, 'post:read');
  const rows = await ctx.db.postMedia.findMany({
    where: { postId },
    orderBy: { position: 'asc' },
    select: { media: { select: SELECT } },
  });
  return rows.map((row) => toSummary(row.media));
}

/** Facebook takes up to ten photos on one post; more is not worth offering. */
export const MAX_MEDIA_PER_POST = 10;

export async function setPostMedia(
  ctx: Context,
  postId: string,
  mediaIds: string[],
): Promise<MediaSummary[]> {
  assertCan(ctx.role, 'post:update');

  const post = await ctx.db.contentPost.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true },
  });
  if (!post) throw new AppError('NOT_FOUND', { message: "That post doesn't exist." });

  const ids = [...new Set(mediaIds)].slice(0, MAX_MEDIA_PER_POST);
  const found = await ctx.db.mediaAsset.findMany({
    where: { id: { in: ids }, deletedAt: null, status: 'ready' },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new AppError('NOT_FOUND', { message: 'One of those images is no longer available.' });
  }

  await ctx.db.postMedia.deleteMany({ where: { postId } });
  if (ids.length > 0) {
    await ctx.db.postMedia.createMany({
      data: ids.map((mediaId, position) => ({
        workspaceId: ctx.workspaceId,
        postId,
        mediaId,
        position,
      })),
    });
  }

  await recordAudit(ctx, {
    action: 'post.media.set',
    targetType: 'content_post',
    targetId: postId,
    metadata: { count: ids.length },
  });

  return listPostMedia(ctx, postId);
}
