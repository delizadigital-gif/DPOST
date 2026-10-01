import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../context';
import { AppError } from '../lib/errors';
import { GraphError } from '../social/facebook/client';
import { isRetryable, type ClassifiedFailure } from '../social/facebook/errors';
import { publishToPage } from '../social/facebook/publish';
import { decryptChannelToken, markChannelNeedsReconnect } from './channels';
import { notify } from './notifications';
import { recordAudit } from './audit';

/**
 * Actually putting a post on Facebook. This is what the worker runs.
 *
 * The hard part is not the API call; it is making sure a post goes out
 * **once**, whatever happens to the worker. Two workers may pick up the same
 * job, a worker may die mid-call, a job may be left over from a schedule
 * that has since moved. So:
 *
 * - The claim is a single conditional UPDATE: `scheduled → publishing` for
 *   this exact `jobVersion`. Exactly one worker can win it; everyone else
 *   sees zero rows changed and stops.
 * - A stale `jobVersion` means the post was rescheduled or cancelled after
 *   this job was queued, so the job does nothing.
 * - Every attempt is written to `publish_attempts` before and after the
 *   call, so a crash leaves a record of what was in flight.
 */

export type PublishOutcome =
  | { status: 'published'; externalPostId: string; externalUrl: string | null }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; failure: ClassifiedFailure; willRetry: boolean };

export interface RunPublicationInput {
  publicationId: string;
  workspaceId: string;
  jobVersion: number;
  /** Attempt number from the queue, 1-based. */
  attempt?: number;
  fetchImpl?: typeof fetch;
}

/**
 * A worker context: no signed-in user, so it is built from the publication's
 * own workspace and runs as the person who scheduled the post.
 */
async function workerContext(workspaceId: string, userId: string): Promise<Context> {
  return createContext({
    userId,
    workspaceId,
    emailVerified: true,
    source: 'worker',
  });
}

export async function runPublication(input: RunPublicationInput): Promise<PublishOutcome> {
  const db = getUnscopedDb();

  const publication = await db.publication.findUnique({
    where: { id: input.publicationId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      jobVersion: true,
      attemptCount: true,
      postId: true,
      channelId: true,
      post: { select: { body: true, hashtags: true, link: true, createdById: true, status: true } },
      channel: { select: { externalId: true, name: true, status: true, isActive: true } },
    },
  });

  if (!publication) return { status: 'skipped', reason: 'publication no longer exists' };
  if (publication.jobVersion !== input.jobVersion) {
    // Rescheduled or cancelled after this job was queued.
    return { status: 'skipped', reason: 'superseded by a newer schedule' };
  }
  if (publication.status === 'published') return { status: 'skipped', reason: 'already published' };
  if (publication.status === 'cancelled') return { status: 'skipped', reason: 'cancelled' };

  // The claim. Only one worker can turn `scheduled` into `publishing` for
  // this version; the losers see count 0 and leave it alone.
  const claim = await db.publication.updateMany({
    where: { id: publication.id, status: 'scheduled', jobVersion: input.jobVersion },
    data: { status: 'publishing', attemptCount: { increment: 1 } },
  });
  if (claim.count === 0) return { status: 'skipped', reason: 'another worker is publishing it' };

  const attemptNumber = publication.attemptCount + 1;
  const ctx = await workerContext(publication.workspaceId, publication.post.createdById);

  const attempt = await db.publishAttempt.create({
    data: {
      workspaceId: publication.workspaceId,
      publicationId: publication.id,
      attempt: attemptNumber,
    },
    select: { id: true },
  });

  const fail = async (failure: ClassifiedFailure, willRetry: boolean): Promise<PublishOutcome> => {
    await db.publishAttempt.update({
      where: { id: attempt.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        errorClass: failure.class,
        errorCode: failure.code,
        // Sanitised by the classifier; never a token, never a raw response.
        errorDetail: failure.message.slice(0, 500),
      },
    });

    await db.publication.update({
      where: { id: publication.id },
      data: {
        status: willRetry ? 'scheduled' : 'failed',
        failureCode: failure.code,
        failureMessage: failure.message,
      },
    });

    if (!willRetry) {
      await notify(ctx, {
        type: 'post_failed',
        title: `A post to ${publication.channel.name} did not go out`,
        body: failure.message,
        href: '/content',
        email: true,
      });
      await recordAudit(ctx, {
        action: 'publication.failed',
        targetType: 'publication',
        targetId: publication.id,
        metadata: { class: failure.class, code: failure.code, attempt: attemptNumber },
      });
    }

    if (failure.class === 'AUTH') {
      await markChannelNeedsReconnect(ctx, publication.channelId, failure.message);
    }

    return { status: 'failed', failure, willRetry };
  };

  if (publication.channel.status !== 'active' || !publication.channel.isActive) {
    return fail(
      {
        class: 'AUTH',
        code: 'channel_inactive',
        message: `${publication.channel.name} needs reconnecting before posts can go out.`,
      },
      false,
    );
  }

  try {
    const token = await decryptChannelToken(ctx, publication.channelId);
    const result = await publishToPage({
      pageId: publication.channel.externalId,
      pageToken: token,
      body: publication.post.body,
      hashtags: publication.post.hashtags,
      link: publication.post.link,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    });

    await db.publishAttempt.update({
      where: { id: attempt.id },
      data: { finishedAt: new Date(), ok: true },
    });
    await db.publication.update({
      where: { id: publication.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        externalPostId: result.externalPostId,
        externalUrl: result.externalUrl,
        failureCode: null,
        failureMessage: null,
      },
    });

    await notify(ctx, {
      type: 'post_published',
      title: `Your post went out on ${publication.channel.name}`,
      body: publication.post.body.slice(0, 140),
      href: '/content',
    });
    await recordAudit(ctx, {
      action: 'publication.published',
      targetType: 'publication',
      targetId: publication.id,
      metadata: { externalPostId: result.externalPostId },
    });

    return {
      status: 'published',
      externalPostId: result.externalPostId,
      externalUrl: result.externalUrl,
    };
  } catch (error) {
    if (error instanceof GraphError) {
      const willRetry = isRetryable(error.failure) && attemptNumber < 3;
      return fail(error.failure, willRetry);
    }

    // Anything else is our bug, not Facebook's. It is worth one more try, but
    // the message to the user stays honest about not knowing why.
    const failure: ClassifiedFailure = {
      class: 'TRANSIENT',
      code: error instanceof AppError ? error.code : 'internal',
      message:
        error instanceof AppError
          ? error.message
          : 'Something went wrong on our side while publishing.',
    };
    return fail(failure, attemptNumber < 3 && !(error instanceof AppError));
  }
}

/**
 * The sweep that catches what the queue lost.
 *
 * Redis is not the source of truth; the database is. If Redis is flushed or
 * a job disappears, publications still sit there marked `scheduled` with a
 * time in the past. This finds them and queues them again — and rescues
 * anything stuck in `publishing` because a worker died mid-call.
 */
export async function reconcilePublications(options: { stuckAfterMs?: number } = {}): Promise<{
  requeued: number;
  unstuck: number;
}> {
  const db = getUnscopedDb();
  const stuckAfterMs = options.stuckAfterMs ?? 10 * 60_000;
  const now = new Date();

  const { enqueuePublish } = await import('../queue/publish-queue');

  const overdue = await db.publication.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
    select: { id: true, workspaceId: true, jobVersion: true, scheduledAt: true },
    take: 500,
  });

  for (const publication of overdue) {
    // The job id is the same, so a job that is still queued is left alone
    // rather than duplicated.
    await enqueuePublish({
      publicationId: publication.id,
      workspaceId: publication.workspaceId,
      jobVersion: publication.jobVersion,
      runAt: now,
    });
  }

  const stuck = await db.publication.updateMany({
    where: { status: 'publishing', updatedAt: { lt: new Date(now.getTime() - stuckAfterMs) } },
    data: { status: 'scheduled' },
  });

  return { requeued: overdue.length, unstuck: stuck.count };
}
