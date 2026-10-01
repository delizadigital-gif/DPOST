import { Worker, type Job } from 'bullmq';
import { getServerEnv } from '@dpost/config';
import { PUBLISH_QUEUE, runPublication, type Logger, type PublishJobData } from '@dpost/core';

/**
 * The processor that puts posts on Facebook.
 *
 * It is deliberately thin: everything that decides anything — the claim, the
 * error classification, the attempt log, the notifications — lives in
 * `runPublication`, where it can be tested against a real database without a
 * queue. This file is about concurrency, retries and shutting down cleanly.
 */

/** Enough to keep up with a busy workspace, few enough to stay polite to Meta. */
const CONCURRENCY = 5;

export function startPublishWorker(logger: Logger): Worker<PublishJobData> {
  const worker = new Worker<PublishJobData>(
    PUBLISH_QUEUE,
    async (job: Job<PublishJobData>) => {
      const outcome = await runPublication({
        publicationId: job.data.publicationId,
        workspaceId: job.data.workspaceId,
        jobVersion: job.data.jobVersion,
        attempt: job.attemptsMade + 1,
      });

      const context = {
        publicationId: job.data.publicationId,
        attempt: job.attemptsMade + 1,
      };

      if (outcome.status === 'published') {
        logger.info({ ...context, externalPostId: outcome.externalPostId }, 'post published');
        return outcome;
      }

      if (outcome.status === 'skipped') {
        logger.info({ ...context, reason: outcome.reason }, 'publish skipped');
        return outcome;
      }

      logger.warn(
        { ...context, class: outcome.failure.class, code: outcome.failure.code },
        'publish failed',
      );

      // Throwing is what asks BullMQ for another attempt. A failure that is
      // not worth retrying returns quietly instead, so the queue doesn't
      // spend three attempts on a post Facebook will never accept.
      if (outcome.willRetry) {
        throw new Error(`${outcome.failure.class}: ${outcome.failure.code}`);
      }
      return outcome;
    },
    {
      connection: { url: getServerEnv().REDIS_URL },
      concurrency: CONCURRENCY,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error(
      { publicationId: job?.data.publicationId, attempt: job?.attemptsMade, err: error },
      'publish job failed',
    );
  });

  return worker;
}
