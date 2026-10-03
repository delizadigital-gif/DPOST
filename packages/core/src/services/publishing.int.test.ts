import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../context';
import { createTestWorld, type TestWorld } from '../testing/fixtures';
import { encryptSecret, getKeyring } from '../lib/crypto';
import { setPublishQueueOverride } from '../queue/publish-queue';
import { createPost, approvePost } from './posts';
import { publishNow, retryPublication, schedulePost, unschedulePost } from './scheduling';
import { reconcilePublications, runPublication } from './publishing';

/**
 * Publishing against a real database, with Facebook replaced by a fake
 * `fetch`. These are the tests the roadmap calls the most important in the
 * project: a post must go out **once**, a failure must be classified and
 * acted on, and a token must never appear anywhere it could leak.
 */

let world: TestWorld;
let ctx: Context;
let channelId: string;
let queued: { jobId: string; data: unknown; delay: number }[] = [];

function fakeQueue() {
  queued = [];
  setPublishQueueOverride({
    add: (async (_name: string, data: unknown, options: { jobId?: string; delay?: number }) => {
      // BullMQ refuses a duplicate job id; the fake does the same, because
      // that refusal is what stops a post being queued twice.
      if (queued.some((job) => job.jobId === options.jobId)) return { id: options.jobId };
      queued.push({ jobId: options.jobId ?? '', data, delay: options.delay ?? 0 });
      return { id: options.jobId };
    }) as never,
    remove: (async (jobId: string) => {
      queued = queued.filter((job) => job.jobId !== jobId);
      return 1;
    }) as never,
  });
}

function graphResponder(
  responses: { status: number; body: unknown; headers?: Record<string, string> }[],
) {
  let index = 0;
  const seen: { url: string; auth: string }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(url),
      auth: new Headers(init?.headers).get('authorization') ?? '',
    });
    const next = responses[Math.min(index++, responses.length - 1)]!;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
}

const PAGE_TOKEN = 'EAAG-page-token-that-must-never-leak';

async function connectTestChannel(): Promise<string> {
  const db = getUnscopedDb();
  const account = await db.socialAccount.create({
    data: {
      workspaceId: ctx.workspaceId,
      platform: 'facebook',
      externalUserId: `fb-user-${Date.now()}`,
      displayName: 'Test User',
      tokenCiphertext: 'x',
      tokenIv: 'x',
      tokenTag: 'x',
      tokenKeyVersion: 1,
      scopes: ['pages_manage_posts'],
      connectedById: ctx.userId,
    },
    select: { id: true },
  });

  const encrypted = encryptSecret(
    PAGE_TOKEN,
    `workspace:${ctx.workspaceId}:social-page-token`,
    getKeyring(),
  );
  const channel = await db.socialChannel.create({
    data: {
      workspaceId: ctx.workspaceId,
      socialAccountId: account.id,
      platform: 'facebook',
      kind: 'facebook_page',
      externalId: '1234567890',
      name: "Rahim's Kitchen",
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenTag: encrypted.tag,
      tokenKeyVersion: encrypted.keyVersion,
      status: 'active',
    },
    select: { id: true },
  });
  return channel.id;
}

async function approvedPost(body = 'Fresh batch out of the kitchen this morning.') {
  const post = await createPost(ctx, { body, hashtags: ['homemade'] });
  await approvePost(ctx, post.id);
  return post;
}

beforeAll(async () => {
  world = createTestWorld();
  const workspace = await world.createWorkspace();
  ctx = await createContext({
    userId: workspace.ownerId,
    workspaceId: workspace.id,
    emailVerified: true,
    source: 'web',
  });
});

beforeEach(async () => {
  fakeQueue();
  channelId = await connectTestChannel();
});

afterEach(async () => {
  setPublishQueueOverride(undefined);
  const db = getUnscopedDb();
  await db.publishAttempt.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.publication.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.contentPost.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.notification.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.socialChannel.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.socialAccount.deleteMany({ where: { workspaceId: ctx.workspaceId } });
});

afterAll(async () => {
  await world.cleanup();
});

describe('scheduling', () => {
  it('queues an approved post for its time', async () => {
    const post = await approvedPost();
    const when = new Date(Date.now() + 60 * 60_000);

    const publication = await schedulePost(ctx, { postId: post.id, channelId, scheduledAt: when });

    expect(publication.status).toBe('scheduled');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.jobId).toBe(`${publication.id}:1`);
    expect(queued[0]?.delay).toBeGreaterThan(50 * 60_000);
  });

  it('refuses to schedule a post nobody approved', async () => {
    const post = await createPost(ctx, { body: 'Not approved yet.' });
    await expect(
      schedulePost(ctx, {
        postId: post.id,
        channelId,
        scheduledAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(queued).toHaveLength(0);
  });

  it('refuses a time too close to now to be cancelled', async () => {
    const post = await approvedPost();
    await expect(
      schedulePost(ctx, {
        postId: post.id,
        channelId,
        scheduledAt: new Date(Date.now() + 30_000),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses a Page that needs reconnecting', async () => {
    await getUnscopedDb().socialChannel.update({
      where: { id: channelId },
      data: { status: 'needs_reconnect' },
    });
    const post = await approvedPost();

    await expect(
      schedulePost(ctx, {
        postId: post.id,
        channelId,
        scheduledAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('swaps the job when a post is rescheduled', async () => {
    const post = await approvedPost();
    const first = await schedulePost(ctx, {
      postId: post.id,
      channelId,
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    await schedulePost(ctx, {
      postId: post.id,
      channelId,
      scheduledAt: new Date(Date.now() + 7_200_000),
    });

    // One job, with a new version: the old one can no longer act.
    expect(queued).toHaveLength(1);
    expect(queued[0]?.jobId).toBe(`${first.id}:2`);
  });

  it('takes a post out of the queue when it is unscheduled', async () => {
    const post = await approvedPost();
    const publication = await schedulePost(ctx, {
      postId: post.id,
      channelId,
      scheduledAt: new Date(Date.now() + 3_600_000),
    });

    await unschedulePost(ctx, publication.id);
    expect(queued).toHaveLength(0);

    const row = await getUnscopedDb().publication.findUnique({ where: { id: publication.id } });
    expect(row?.status).toBe('cancelled');
  });
});

describe('publishing', () => {
  it('posts to the Page and records where it went', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl, seen } = graphResponder([{ status: 200, body: { id: '1234567890_555' } }]);

    const outcome = await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    expect(outcome).toMatchObject({ status: 'published', externalPostId: '1234567890_555' });
    expect(seen[0]?.auth).toBe(`Bearer ${PAGE_TOKEN}`);

    const row = await getUnscopedDb().publication.findUnique({ where: { id: publication.id } });
    expect(row?.status).toBe('published');
    expect(row?.externalUrl).toBe('https://www.facebook.com/1234567890/posts/555');
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it('tells the user it went out', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([{ status: 200, body: { id: '1_2' } }]);

    await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    const notification = await getUnscopedDb().notification.findFirst({
      where: { workspaceId: ctx.workspaceId, type: 'post_published' },
    });
    expect(notification?.title).toContain("Rahim's Kitchen");
    // A success is in-app only: an inbox full of "it worked" teaches people
    // to ignore the one that says it didn't.
    expect(notification?.emailedAt).toBeNull();
  });

  it('publishes once, even when two workers take the same job', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl, seen } = graphResponder([{ status: 200, body: { id: '1_2' } }]);

    const [first, second] = await Promise.all([
      runPublication({
        publicationId: publication.id,
        workspaceId: ctx.workspaceId,
        jobVersion: publication.jobVersion,
        fetchImpl,
      }),
      runPublication({
        publicationId: publication.id,
        workspaceId: ctx.workspaceId,
        jobVersion: publication.jobVersion,
        fetchImpl,
      }),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(['published', 'skipped']);
    // One call to Facebook: the claim is what prevents a double post.
    expect(seen).toHaveLength(1);
  });

  it('does nothing for a job whose schedule has moved on', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl, seen } = graphResponder([{ status: 200, body: { id: '1_2' } }]);

    const outcome = await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion + 1, // a version that never existed
      fetchImpl,
    });

    expect(outcome).toEqual({ status: 'skipped', reason: 'superseded by a newer schedule' });
    expect(seen).toHaveLength(0);
  });

  it('keeps an attempt record for every try', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([{ status: 200, body: { id: '1_2' } }]);

    await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    const attempts = await getUnscopedDb().publishAttempt.findMany({
      where: { publicationId: publication.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attempt: 1, ok: true });
    expect(attempts[0]?.finishedAt).toBeInstanceOf(Date);
  });
});

describe('when Facebook refuses', () => {
  it('leaves a temporary failure ready for another try', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([
      { status: 500, body: { error: { message: 'Internal', code: 2 } } },
    ]);

    const outcome = await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    expect(outcome).toMatchObject({ status: 'failed', willRetry: true });
    const row = await getUnscopedDb().publication.findUnique({ where: { id: publication.id } });
    expect(row?.status).toBe('scheduled');
  });

  it('gives up on a post Facebook will never take, and says why', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([
      {
        status: 400,
        body: { error: { message: 'Invalid', code: 100, error_user_msg: 'This link is blocked.' } },
      },
    ]);

    const outcome = await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    expect(outcome).toMatchObject({ status: 'failed', willRetry: false });
    const row = await getUnscopedDb().publication.findUnique({ where: { id: publication.id } });
    expect(row?.status).toBe('failed');
    expect(row?.failureMessage).toBe('This link is blocked.');

    const notification = await getUnscopedDb().notification.findFirst({
      where: { workspaceId: ctx.workspaceId, type: 'post_failed' },
    });
    expect(notification?.body).toBe('This link is blocked.');
  });

  it('marks the Page as needing reconnection when the token is rejected', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([
      { status: 400, body: { error: { message: 'Token expired', code: 190 } } },
    ]);

    const outcome = await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    expect(outcome).toMatchObject({ status: 'failed', willRetry: false });

    const channel = await getUnscopedDb().socialChannel.findUnique({ where: { id: channelId } });
    expect(channel?.status).toBe('needs_reconnect');

    const email = await getUnscopedDb().notification.findFirst({
      where: { workspaceId: ctx.workspaceId, type: 'channel_disconnected' },
    });
    expect(email?.title).toContain('needs reconnecting');
  });

  it('never writes the token into an attempt record', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([
      {
        status: 400,
        body: { error: { message: `Bad token ${PAGE_TOKEN}`, code: 190, fbtrace_id: 'abc' } },
      },
    ]);

    await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    const attempts = await getUnscopedDb().publishAttempt.findMany({
      where: { publicationId: publication.id },
    });
    const publicationRow = await getUnscopedDb().publication.findUnique({
      where: { id: publication.id },
    });

    expect(JSON.stringify(attempts)).not.toContain('EAAG');
    expect(JSON.stringify(publicationRow)).not.toContain('EAAG');
  });

  it('can be tried again by hand once the Page is back', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    const { fetchImpl } = graphResponder([
      { status: 400, body: { error: { message: 'Invalid', code: 100 } } },
    ]);
    await runPublication({
      publicationId: publication.id,
      workspaceId: ctx.workspaceId,
      jobVersion: publication.jobVersion,
      fetchImpl,
    });

    queued = [];
    const retried = await retryPublication(ctx, publication.id);
    expect(retried.status).toBe('scheduled');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.jobId).toBe(`${publication.id}:${publication.jobVersion + 1}`);
  });
});

describe('the sweep that catches what the queue lost', () => {
  it('queues an overdue post again after Redis forgot it', async () => {
    const post = await approvedPost();
    const publication = await schedulePost(ctx, {
      postId: post.id,
      channelId,
      scheduledAt: new Date(Date.now() + 3_600_000),
    });

    // Redis loses everything, and the time passes.
    queued = [];
    await getUnscopedDb().publication.update({
      where: { id: publication.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });

    const result = await reconcilePublications();
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect(queued.some((job) => job.jobId === `${publication.id}:1`)).toBe(true);
  });

  it('rescues a publication left mid-flight by a worker that died', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    await getUnscopedDb().publication.update({
      where: { id: publication.id },
      data: { status: 'publishing', updatedAt: new Date(Date.now() - 30 * 60_000) },
    });

    const result = await reconcilePublications({ stuckAfterMs: 10 * 60_000 });
    expect(result.unstuck).toBe(1);

    const row = await getUnscopedDb().publication.findUnique({ where: { id: publication.id } });
    expect(row?.status).toBe('scheduled');
  });

  it('leaves a publication that is only just publishing alone', async () => {
    const post = await approvedPost();
    const publication = await publishNow(ctx, { postId: post.id, channelId });
    await getUnscopedDb().publication.update({
      where: { id: publication.id },
      data: { status: 'publishing' },
    });

    const result = await reconcilePublications({ stuckAfterMs: 10 * 60_000 });
    expect(result.unstuck).toBe(0);
  });
});

describe('scheduling to a Page that is not there', () => {
  it('refuses an unknown channel rather than queueing into the void', async () => {
    const post = await approvedPost();
    await expect(
      schedulePost(ctx, {
        postId: post.id,
        channelId: '0199e4e0-0000-7000-8000-000000000000',
        scheduledAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(queued).toHaveLength(0);
  });

  it('refuses a channel belonging to another workspace', async () => {
    const other = await world.createWorkspace();
    const otherCtx = await createContext({
      userId: other.ownerId,
      workspaceId: other.id,
      emailVerified: true,
      source: 'web',
    });
    const post = await approvedPost();

    // The channel exists, but not for this workspace: the tenant-scoped
    // client cannot see it, so it is simply not found.
    await expect(
      schedulePost(otherCtx, {
        postId: post.id,
        channelId,
        scheduledAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('publishing with an image', () => {
  it('sends the image to Facebook by its public address', async () => {
    const { createMemoryStorage, setStorageProvider } = await import('../storage');
    const { uploadMedia, setPostMedia } = await import('./media');
    const sharp = (await import('sharp')).default;

    const storage = createMemoryStorage();
    setStorageProvider(storage);
    try {
      const photo = await sharp({
        create: { width: 400, height: 400, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .jpeg()
        .toBuffer();

      const post = await approvedPost('A post with a photo.');
      const media = await uploadMedia(ctx, { bytes: photo, filename: 'dish.jpg' });
      await setPostMedia(ctx, post.id, [media.id]);

      const publication = await publishNow(ctx, { postId: post.id, channelId });
      const { fetchImpl, seen } = graphResponder([
        { status: 200, body: { id: 'photo_1', post_id: '1234567890_999' } },
      ]);

      const outcome = await runPublication({
        publicationId: publication.id,
        workspaceId: ctx.workspaceId,
        jobVersion: publication.jobVersion,
        fetchImpl,
      });

      expect(outcome.status).toBe('published');
      // A single photo goes to the photos endpoint, not the plain feed.
      expect(seen[0]?.url).toContain('/photos');

      await getUnscopedDb().postMedia.deleteMany({ where: { workspaceId: ctx.workspaceId } });
      await getUnscopedDb().mediaAsset.deleteMany({ where: { workspaceId: ctx.workspaceId } });
    } finally {
      setStorageProvider(undefined);
    }
  });
});
