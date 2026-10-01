import { Queue, type JobsOptions } from 'bullmq';
import { getServerEnv } from '@dpost/config';

/**
 * The publishing queue.
 *
 * Two decisions do most of the work here:
 *
 * - **The job id is `publicationId:jobVersion`.** BullMQ refuses a second
 *   job with an id it already has, so a double-click or a retried request
 *   cannot queue the same post twice. Rescheduling bumps the version, which
 *   makes a new id and leaves the old job inert — it will find a publication
 *   whose version has moved on and stop.
 * - **Attempts and backoff live with the queue**, so a post that fails on a
 *   Facebook hiccup is tried again without anyone watching.
 */

export const PUBLISH_QUEUE = 'publish';
export const TOKEN_HEALTH_QUEUE = 'token-health';
export const RECONCILE_QUEUE = 'reconcile';

export interface PublishJobData {
  publicationId: string;
  workspaceId: string;
  jobVersion: number;
}

/** Three tries: one at the time, then roughly a minute, then four. */
export const PUBLISH_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function publishJobId(publicationId: string, jobVersion: number): string {
  return `${publicationId}:${jobVersion}`;
}

let queue: Queue<PublishJobData> | undefined;

export function getPublishQueue(): Queue<PublishJobData> {
  queue ??= new Queue<PublishJobData>(PUBLISH_QUEUE, {
    connection: { url: getServerEnv().REDIS_URL },
  });
  return queue;
}

/** Replaced in tests, so scheduling can be checked without Redis. */
let queueOverride: Pick<Queue<PublishJobData>, 'add' | 'remove'> | undefined;

export function setPublishQueueOverride(
  override: Pick<Queue<PublishJobData>, 'add' | 'remove'> | undefined,
): void {
  queueOverride = override;
}

function target(): Pick<Queue<PublishJobData>, 'add' | 'remove'> {
  return queueOverride ?? getPublishQueue();
}

export interface EnqueuePublishInput extends PublishJobData {
  runAt: Date;
}

export async function enqueuePublish(input: EnqueuePublishInput): Promise<void> {
  const delay = Math.max(0, input.runAt.getTime() - Date.now());
  await target().add(
    'publish',
    {
      publicationId: input.publicationId,
      workspaceId: input.workspaceId,
      jobVersion: input.jobVersion,
    },
    {
      ...PUBLISH_JOB_OPTIONS,
      delay,
      jobId: publishJobId(input.publicationId, input.jobVersion),
    },
  );
}

/** Drops a queued job. A job already running is stopped by its version. */
export async function removePublishJob(publicationId: string, jobVersion: number): Promise<void> {
  try {
    await target().remove(publishJobId(publicationId, jobVersion));
  } catch {
    // Already gone, or already running: the version check is what actually
    // guarantees a stale job does nothing.
  }
}

export async function closePublishQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
