import type { PublicationStatus } from '@dpost/db';
import { assertCan, assertEmailVerified } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { enqueuePublish, removePublishJob } from '../queue/publish-queue';
import { recordAudit } from './audit';
import { getPost } from './posts';

/**
 * Putting an approved post in the queue, moving it, and taking it out again.
 *
 * DPOST schedules in its own queue rather than using Facebook's
 * `scheduled_publish_time`, so a post can be edited, approved or cancelled
 * up to the last minute without syncing anything to Meta, and so the same
 * engine will serve other platforms later (docs/08 §6). The cost is that we
 * must run a reliable worker — hence retries, the reconcile sweep, and the
 * attempt log.
 */

/** Just enough time for someone to realise and cancel. */
export const MIN_LEAD_TIME_MS = 2 * 60_000;

export interface PublicationSummary {
  id: string;
  postId: string;
  channelId: string;
  channelName: string;
  scheduledAt: Date;
  status: PublicationStatus;
  /** Bumped on every reschedule; the queue job's id is built from it. */
  jobVersion: number;
  externalUrl: string | null;
  publishedAt: Date | null;
  failureMessage: string | null;
  attemptCount: number;
}

const SUMMARY_SELECT = {
  id: true,
  postId: true,
  channelId: true,
  scheduledAt: true,
  status: true,
  jobVersion: true,
  externalUrl: true,
  publishedAt: true,
  failureMessage: true,
  attemptCount: true,
  channel: { select: { name: true } },
} as const;

type RawPublication = {
  channel: { name: string } | null;
} & Omit<PublicationSummary, 'channelName'>;

function toSummary(row: RawPublication): PublicationSummary {
  const { channel, ...rest } = row;
  return { ...rest, channelName: channel?.name ?? 'Unknown page' };
}

export interface ScheduleInput {
  postId: string;
  channelId: string;
  scheduledAt: Date;
}

/**
 * Schedules an approved post.
 *
 * Three things are checked before anything is queued, because each one is a
 * promise that would otherwise be broken silently: the post is approved, the
 * channel can actually publish, and the time is far enough ahead to be
 * cancelled.
 */
export async function schedulePost(
  ctx: Context,
  input: ScheduleInput,
): Promise<PublicationSummary> {
  assertCan(ctx.role, 'post:schedule');
  assertEmailVerified(ctx);

  const post = await getPost(ctx, input.postId);
  if (post.status !== 'approved') {
    throw new AppError('CONFLICT', {
      message: 'Approve this post before scheduling it.',
      details: { status: post.status },
    });
  }

  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: input.channelId },
    select: { id: true, name: true, status: true, isActive: true },
  });
  if (!channel) throw new AppError('NOT_FOUND', { message: 'That Page is not connected.' });
  if (channel.status !== 'active' || !channel.isActive) {
    throw new AppError('CONFLICT', {
      message: `${channel.name} needs reconnecting before posts can go out to it.`,
    });
  }

  if (input.scheduledAt.getTime() < Date.now() + MIN_LEAD_TIME_MS) {
    throw new AppError('VALIDATION', {
      message: 'Choose a time at least two minutes from now, or publish it straight away.',
    });
  }

  const existing = await ctx.db.publication.findFirst({
    where: { postId: input.postId, channelId: input.channelId },
    select: { id: true, status: true, jobVersion: true },
  });

  if (existing && (existing.status === 'published' || existing.status === 'publishing')) {
    throw new AppError('CONFLICT', {
      message:
        existing.status === 'published'
          ? 'This post has already gone out to that Page.'
          : 'This post is being published right now.',
    });
  }

  // A reschedule bumps the version, which changes the queue job's id — the
  // old job becomes one nobody will act on, even if it is already in flight.
  const publication = existing
    ? await ctx.db.publication.update({
        where: { id: existing.id },
        data: {
          scheduledAt: input.scheduledAt,
          status: 'scheduled',
          jobVersion: { increment: 1 },
          failureCode: null,
          failureMessage: null,
        },
        select: SUMMARY_SELECT,
      })
    : await ctx.db.publication.create({
        data: {
          workspaceId: ctx.workspaceId,
          postId: input.postId,
          channelId: input.channelId,
          scheduledAt: input.scheduledAt,
          status: 'scheduled',
        },
        select: SUMMARY_SELECT,
      });

  if (existing) await removePublishJob(existing.id, existing.jobVersion);
  await enqueuePublish({
    publicationId: publication.id,
    workspaceId: ctx.workspaceId,
    jobVersion: publication.jobVersion,
    runAt: input.scheduledAt,
  });

  await ctx.db.contentPost.update({
    where: { id: input.postId },
    data: { plannedFor: input.scheduledAt },
  });

  await recordAudit(ctx, {
    action: existing ? 'post.reschedule' : 'post.schedule',
    targetType: 'publication',
    targetId: publication.id,
    metadata: { channelId: input.channelId, scheduledAt: input.scheduledAt.toISOString() },
  });

  return toSummary(publication as RawPublication);
}

/** Takes a post out of the queue. The post itself is untouched. */
export async function unschedulePost(ctx: Context, publicationId: string): Promise<void> {
  assertCan(ctx.role, 'post:schedule');

  const publication = await ctx.db.publication.findFirst({
    where: { id: publicationId },
    select: { id: true, status: true, jobVersion: true, postId: true },
  });
  if (!publication) throw new AppError('NOT_FOUND', { message: 'That scheduled post is gone.' });
  if (publication.status === 'published') {
    throw new AppError('CONFLICT', { message: 'That post has already gone out.' });
  }

  await ctx.db.publication.update({
    where: { id: publicationId },
    data: { status: 'cancelled', jobVersion: { increment: 1 } },
  });
  await removePublishJob(publicationId, publication.jobVersion);
  await ctx.db.contentPost.update({
    where: { id: publication.postId },
    data: { plannedFor: null },
  });

  await recordAudit(ctx, {
    action: 'post.unschedule',
    targetType: 'publication',
    targetId: publicationId,
  });
}

/**
 * Publishes now, through the same queue as everything else. Going straight
 * to Facebook from a web request would mean two publishing paths, and the
 * one used rarely is the one that breaks.
 */
export async function publishNow(
  ctx: Context,
  input: { postId: string; channelId: string },
): Promise<PublicationSummary> {
  assertCan(ctx.role, 'post:publish');
  assertEmailVerified(ctx);

  const post = await getPost(ctx, input.postId);
  if (post.status !== 'approved') {
    throw new AppError('CONFLICT', { message: 'Approve this post before publishing it.' });
  }

  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: input.channelId },
    select: { id: true, name: true, status: true, isActive: true },
  });
  if (!channel) throw new AppError('NOT_FOUND', { message: 'That Page is not connected.' });
  if (channel.status !== 'active' || !channel.isActive) {
    throw new AppError('CONFLICT', { message: `${channel.name} needs reconnecting first.` });
  }

  const existing = await ctx.db.publication.findFirst({
    where: { postId: input.postId, channelId: input.channelId },
    select: { id: true, status: true, jobVersion: true },
  });
  if (existing?.status === 'published') {
    throw new AppError('CONFLICT', { message: 'This post has already gone out to that Page.' });
  }

  const now = new Date();
  const publication = existing
    ? await ctx.db.publication.update({
        where: { id: existing.id },
        data: {
          scheduledAt: now,
          status: 'scheduled',
          jobVersion: { increment: 1 },
          failureCode: null,
          failureMessage: null,
        },
        select: SUMMARY_SELECT,
      })
    : await ctx.db.publication.create({
        data: {
          workspaceId: ctx.workspaceId,
          postId: input.postId,
          channelId: input.channelId,
          scheduledAt: now,
          status: 'scheduled',
        },
        select: SUMMARY_SELECT,
      });

  if (existing) await removePublishJob(existing.id, existing.jobVersion);
  await enqueuePublish({
    publicationId: publication.id,
    workspaceId: ctx.workspaceId,
    jobVersion: publication.jobVersion,
    runAt: now,
  });

  await recordAudit(ctx, {
    action: 'post.publish_now',
    targetType: 'publication',
    targetId: publication.id,
    metadata: { channelId: input.channelId },
  });

  return toSummary(publication as RawPublication);
}

/** Tries a failed publication again, from the beginning. */
export async function retryPublication(
  ctx: Context,
  publicationId: string,
): Promise<PublicationSummary> {
  assertCan(ctx.role, 'post:publish');

  const publication = await ctx.db.publication.findFirst({
    where: { id: publicationId },
    select: { id: true, status: true, jobVersion: true, channelId: true },
  });
  if (!publication) throw new AppError('NOT_FOUND', { message: 'That scheduled post is gone.' });
  if (publication.status !== 'failed') {
    throw new AppError('CONFLICT', { message: 'Only a failed post can be tried again.' });
  }

  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: publication.channelId },
    select: { name: true, status: true },
  });
  if (channel?.status !== 'active') {
    throw new AppError('CONFLICT', {
      message: `${channel?.name ?? 'That Page'} needs reconnecting before trying again.`,
    });
  }

  const updated = await ctx.db.publication.update({
    where: { id: publicationId },
    data: {
      status: 'scheduled',
      jobVersion: { increment: 1 },
      failureCode: null,
      failureMessage: null,
    },
    select: SUMMARY_SELECT,
  });
  await enqueuePublish({
    publicationId,
    workspaceId: ctx.workspaceId,
    jobVersion: updated.jobVersion,
    runAt: new Date(),
  });

  await recordAudit(ctx, {
    action: 'post.retry',
    targetType: 'publication',
    targetId: publicationId,
  });

  return toSummary(updated as RawPublication);
}

/** What is queued for a post, for the sheet and the calendar. */
export async function listPublications(
  ctx: Context,
  postId: string,
): Promise<PublicationSummary[]> {
  assertCan(ctx.role, 'post:read');
  const rows = await ctx.db.publication.findMany({
    where: { postId },
    orderBy: { scheduledAt: 'asc' },
    select: SUMMARY_SELECT,
  });
  return rows.map((row) => toSummary(row as RawPublication));
}

/** Everything due in a window, for the home page's "up next". */
export async function listUpcoming(ctx: Context, limit = 10): Promise<PublicationSummary[]> {
  assertCan(ctx.role, 'post:read');
  const rows = await ctx.db.publication.findMany({
    where: { status: 'scheduled', scheduledAt: { gte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: Math.min(limit, 50),
    select: SUMMARY_SELECT,
  });
  return rows.map((row) => toSummary(row as RawPublication));
}
