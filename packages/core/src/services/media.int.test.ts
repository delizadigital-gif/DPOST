import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../context';
import { createTestWorld, type TestWorld } from '../testing/fixtures';
import { createMemoryStorage, setStorageProvider, workspaceOfKey } from '../storage';
import { approvePost, createPost } from './posts';
import {
  deleteMedia,
  getMedia,
  listMedia,
  listPostMedia,
  setPostMedia,
  updateMedia,
  uploadMedia,
} from './media';

/**
 * The media library against a real database, with storage in memory.
 *
 * The questions worth asking: does an image end up where it belongs, can one
 * workspace reach another's files, and does deleting an image ever break a
 * post that is already on its way out?
 */

let world: TestWorld;
let ctx: Context;
let otherCtx: Context;
let storage: ReturnType<typeof createMemoryStorage>;
let photo: Buffer;

beforeAll(async () => {
  world = createTestWorld();
  const workspace = await world.createWorkspace();
  ctx = await createContext({
    userId: workspace.ownerId,
    workspaceId: workspace.id,
    emailVerified: true,
    source: 'web',
  });

  const other = await world.createWorkspace();
  otherCtx = await createContext({
    userId: other.ownerId,
    workspaceId: other.id,
    emailVerified: true,
    source: 'web',
  });

  photo = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 40, b: 200 } },
  })
    .jpeg()
    .toBuffer();
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageProvider(storage);
});

afterEach(async () => {
  setStorageProvider(undefined);
  const db = getUnscopedDb();
  const workspaces = [ctx.workspaceId, otherCtx.workspaceId];
  await db.postMedia.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.publication.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.mediaAsset.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.contentPost.deleteMany({ where: { workspaceId: { in: workspaces } } });
});

afterAll(async () => {
  await world.cleanup();
});

describe('uploading', () => {
  it('stores the image and a thumbnail, and remembers its size', async () => {
    const media = await uploadMedia(ctx, { bytes: photo, filename: 'kitchen.jpg' });

    expect(media.status).toBe('ready');
    expect(media.width).toBe(800);
    expect(media.height).toBe(600);
    expect(media.mimeType).toBe('image/webp');
    expect(media.thumbUrl).toBeTruthy();
    expect(storage.objects.size).toBe(2);
  });

  it('files everything under the workspace that owns it', async () => {
    await uploadMedia(ctx, { bytes: photo });
    for (const key of storage.objects.keys()) {
      expect(workspaceOfKey(key)).toBe(ctx.workspaceId);
    }
  });

  it('records a failure instead of leaving a half-made image', async () => {
    const notAnImage = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1000, 0x90)]);
    await expect(uploadMedia(ctx, { bytes: notAnImage })).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    const rows = await getUnscopedDb().mediaAsset.findMany({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    // Nothing reached storage, so there is no orphan file.
    expect(storage.objects.size).toBe(0);
  });

  it('leaves a failed image out of the library', async () => {
    await uploadMedia(ctx, { bytes: photo });
    await expect(uploadMedia(ctx, { bytes: Buffer.alloc(40, 0x00) })).rejects.toBeDefined();

    const { media, total } = await listMedia(ctx);
    expect(total).toBe(1);
    expect(media).toHaveLength(1);
  });
});

describe('the library', () => {
  it('finds images by filename, alt text or prompt', async () => {
    await uploadMedia(ctx, { bytes: photo, filename: 'biryani-friday.jpg' });
    await uploadMedia(ctx, {
      bytes: photo,
      filename: 'shopfront.jpg',
      altText: 'Our shop at dusk',
    });
    await uploadMedia(ctx, {
      bytes: photo,
      source: 'ai',
      prompt: 'A warm plate of kacchi on a table',
    });

    expect((await listMedia(ctx, { search: 'biryani' })).total).toBe(1);
    expect((await listMedia(ctx, { search: 'dusk' })).total).toBe(1);
    expect((await listMedia(ctx, { search: 'kacchi' })).total).toBe(1);
  });

  it('separates what the AI made from what was uploaded', async () => {
    await uploadMedia(ctx, { bytes: photo, filename: 'mine.jpg' });
    await uploadMedia(ctx, { bytes: photo, source: 'ai', prompt: 'something' });

    expect((await listMedia(ctx, { source: ['ai'] })).total).toBe(1);
    expect((await listMedia(ctx, { source: ['upload'] })).total).toBe(1);
  });

  it('pages through a long library', async () => {
    for (let index = 0; index < 5; index++) {
      await uploadMedia(ctx, { bytes: photo, filename: `image-${index}.jpg` });
    }

    const first = await listMedia(ctx, { limit: 2 });
    expect(first.media).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await listMedia(ctx, { limit: 2, cursor: first.nextCursor! });
    const ids = new Set([...first.media, ...second.media].map((item) => item.id));
    expect(ids.size).toBe(4);
  });

  it('keeps the alt text someone wrote', async () => {
    const media = await uploadMedia(ctx, { bytes: photo });
    const updated = await updateMedia(ctx, media.id, {
      altText: 'A plate of kacchi biryani',
      tags: ['food', 'menu'],
    });
    expect(updated.altText).toBe('A plate of kacchi biryani');
    expect(updated.tags).toEqual(['food', 'menu']);
  });
});

describe('attaching images to posts', () => {
  it('keeps the order they were chosen in', async () => {
    const first = await uploadMedia(ctx, { bytes: photo, filename: 'one.jpg' });
    const second = await uploadMedia(ctx, { bytes: photo, filename: 'two.jpg' });
    const post = await createPost(ctx, { body: 'Two photos.' });

    const attached = await setPostMedia(ctx, post.id, [second.id, first.id]);
    expect(attached.map((item) => item.filename)).toEqual(['two.jpg', 'one.jpg']);
  });

  it('replaces the set rather than adding to it', async () => {
    const first = await uploadMedia(ctx, { bytes: photo });
    const second = await uploadMedia(ctx, { bytes: photo });
    const post = await createPost(ctx, { body: 'Changing my mind.' });

    await setPostMedia(ctx, post.id, [first.id]);
    await setPostMedia(ctx, post.id, [second.id]);
    expect((await listPostMedia(ctx, post.id)).map((item) => item.id)).toEqual([second.id]);
  });

  it('refuses an image that is not there', async () => {
    const post = await createPost(ctx, { body: 'A post.' });
    await expect(
      setPostMedia(ctx, post.id, ['0199e4e0-0000-7000-8000-000000000000']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleting', () => {
  it('removes an unused image and its files', async () => {
    const media = await uploadMedia(ctx, { bytes: photo });
    expect(storage.objects.size).toBe(2);

    await deleteMedia(ctx, media.id);

    await expect(getMedia(ctx, media.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.objects.size).toBe(0);
  });

  it('refuses to break a scheduled post', async () => {
    const media = await uploadMedia(ctx, { bytes: photo });
    const post = await createPost(ctx, { body: 'Going out tonight.' });
    await approvePost(ctx, post.id);
    await setPostMedia(ctx, post.id, [media.id]);

    const account = await getUnscopedDb().socialAccount.create({
      data: {
        workspaceId: ctx.workspaceId,
        platform: 'facebook',
        externalUserId: `fb-${Date.now()}`,
        tokenCiphertext: 'x',
        tokenIv: 'x',
        tokenTag: 'x',
        tokenKeyVersion: 1,
        connectedById: ctx.userId,
      },
      select: { id: true },
    });
    const channel = await getUnscopedDb().socialChannel.create({
      data: {
        workspaceId: ctx.workspaceId,
        socialAccountId: account.id,
        platform: 'facebook',
        kind: 'facebook_page',
        externalId: 'page-1',
        name: 'Test Page',
      },
      select: { id: true },
    });
    await getUnscopedDb().publication.create({
      data: {
        workspaceId: ctx.workspaceId,
        postId: post.id,
        channelId: channel.id,
        scheduledAt: new Date(Date.now() + 3_600_000),
        status: 'scheduled',
      },
    });

    // Facebook fetches the file from us when the post goes out, so deleting
    // it now would break a post the owner still expects to see.
    await expect(deleteMedia(ctx, media.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(storage.objects.size).toBe(2);

    await getUnscopedDb().socialChannel.deleteMany({ where: { workspaceId: ctx.workspaceId } });
    await getUnscopedDb().socialAccount.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  });

  it('allows deleting an image only a draft uses', async () => {
    const media = await uploadMedia(ctx, { bytes: photo });
    const post = await createPost(ctx, { body: 'Only a draft.' });
    await setPostMedia(ctx, post.id, [media.id]);

    await expect(deleteMedia(ctx, media.id)).resolves.toBeUndefined();
    expect(await listPostMedia(ctx, post.id)).toEqual([]);
  });
});

describe('isolation between workspaces', () => {
  it('never lists another workspace’s images', async () => {
    await uploadMedia(ctx, { bytes: photo, filename: 'ours.jpg' });
    await uploadMedia(otherCtx, { bytes: photo, filename: 'theirs.jpg' });

    expect((await listMedia(ctx)).media.map((item) => item.filename)).toEqual(['ours.jpg']);
    expect((await listMedia(otherCtx)).media.map((item) => item.filename)).toEqual(['theirs.jpg']);
  });

  it('cannot read, change or delete across workspaces', async () => {
    const mine = await uploadMedia(ctx, { bytes: photo, filename: 'mine.jpg' });

    await expect(getMedia(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(updateMedia(otherCtx, mine.id, { altText: 'theirs' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(deleteMedia(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.objects.size).toBe(2);
  });

  it('cannot attach another workspace’s image to a post', async () => {
    const theirs = await uploadMedia(otherCtx, { bytes: photo });
    const post = await createPost(ctx, { body: 'Trying to borrow an image.' });

    await expect(setPostMedia(ctx, post.id, [theirs.id])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('permissions', () => {
  it('lets a viewer look but not upload or delete', async () => {
    const media = await uploadMedia(ctx, { bytes: photo });
    const viewer = await world.createUser();
    await world.addMember(ctx.workspaceId, viewer.id, 'viewer');
    const viewerCtx = await createContext({
      userId: viewer.id,
      workspaceId: ctx.workspaceId,
      emailVerified: true,
      source: 'web',
    });

    await expect(listMedia(viewerCtx)).resolves.toBeDefined();
    await expect(uploadMedia(viewerCtx, { bytes: photo })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(deleteMedia(viewerCtx, media.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
