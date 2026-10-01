import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../context';
import { createTestWorld, type TestWorld } from '../testing/fixtures';
import {
  approvePost,
  approvePosts,
  countPostsByStatus,
  createPost,
  deletePost,
  deletePosts,
  duplicatePost,
  getPost,
  listPosts,
  listPostsInRange,
  listRevisions,
  restorePost,
  restoreRevision,
  updatePost,
} from './posts';

/**
 * The post lifecycle against a real database: what an edit does to approval,
 * that every edit is recoverable, that deleting hides without destroying,
 * and that one workspace can never see or touch another's posts.
 */

let world: TestWorld;
let ctx: Context;
let otherCtx: Context;

const draft = (body: string, extra: Parameters<typeof createPost>[1] = { body }) =>
  createPost(ctx, { ...extra, body });

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
});

afterEach(async () => {
  const db = getUnscopedDb();
  await db.postRevision.deleteMany({
    where: { workspaceId: { in: [ctx.workspaceId, otherCtx.workspaceId] } },
  });
  await db.contentPost.deleteMany({
    where: { workspaceId: { in: [ctx.workspaceId, otherCtx.workspaceId] } },
  });
});

afterAll(async () => {
  await world.cleanup();
});

describe('writing and reading', () => {
  it('saves a draft and reads it back', async () => {
    const post = await draft('Fresh batch out of the kitchen this morning.');
    expect(post.status).toBe('draft');

    const read = await getPost(ctx, post.id);
    expect(read.body).toBe('Fresh batch out of the kitchen this morning.');
  });

  it('refuses a post Facebook would reject', async () => {
    await expect(
      createPost(ctx, { body: 'Too many tags', hashtags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('tidies hashtags on the way in', async () => {
    const post = await createPost(ctx, {
      body: 'A post',
      hashtags: ['#Homemade', 'homemade', '  '],
    });
    expect(post.hashtags).toEqual(['Homemade']);
  });
});

describe('editing', () => {
  it('keeps what the post said before', async () => {
    const post = await draft('First version of the post.');
    await updatePost(ctx, post.id, { body: 'Second version of the post.' });

    const revisions = await listRevisions(ctx, post.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.body).toBe('First version of the post.');
    expect(revisions[0]?.kind).toBe('edit');
  });

  it('records nothing when the text did not actually change', async () => {
    const post = await draft('Unchanged text.');
    await updatePost(ctx, post.id, { body: 'Unchanged text.' });
    expect(await listRevisions(ctx, post.id)).toHaveLength(0);
  });

  it('withdraws approval, because approval was of a particular text', async () => {
    const post = await draft('Approved text.');
    const approved = await approvePost(ctx, post.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeInstanceOf(Date);

    const edited = await updatePost(ctx, post.id, { body: 'Changed after approval.' });
    expect(edited.status).toBe('pending_review');
    expect(edited.approvedAt).toBeNull();
  });

  it('moves an AI draft into review once a person edits it', async () => {
    const post = await createPost(ctx, {
      body: 'Written by the machine.',
      status: 'ai_generated',
      source: 'ai_single',
    });
    const edited = await updatePost(ctx, post.id, { body: 'Written by the machine, fixed.' });
    expect(edited.status).toBe('pending_review');
  });

  it('restores an earlier version, and keeps the one it replaced', async () => {
    const post = await draft('Version one.');
    await updatePost(ctx, post.id, { body: 'Version two.' });
    const [first] = await listRevisions(ctx, post.id);

    const restored = await restoreRevision(ctx, post.id, first!.id);
    expect(restored.body).toBe('Version one.');

    // Undoing is itself an edit, so "version two" is still recoverable.
    const revisions = await listRevisions(ctx, post.id);
    expect(revisions.map((revision) => revision.body)).toEqual(['Version two.', 'Version one.']);
  });

  it('refuses to edit an archived post', async () => {
    const post = await draft('To be archived.');
    await getUnscopedDb().contentPost.update({
      where: { id: post.id },
      data: { status: 'archived' },
    });
    await expect(updatePost(ctx, post.id, { body: 'Nope.' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('approving', () => {
  it('approves a batch and says what it skipped', async () => {
    const first = await draft('One.');
    const second = await draft('Two.');
    await approvePost(ctx, second.id);

    const result = await approvePosts(ctx, [
      first.id,
      second.id,
      '0199e4e0-0000-7000-8000-000000000000',
    ]);
    expect(result.changed).toBe(1);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { id: second.id, reason: 'already approved' },
        { id: '0199e4e0-0000-7000-8000-000000000000', reason: 'not found' },
      ]),
    );
  });

  it('refuses a batch bigger than the cap', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `id-${index}`);
    await expect(approvePosts(ctx, ids)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('duplicating', () => {
  it('copies the words but not the schedule or the approval', async () => {
    const post = await createPost(ctx, {
      body: 'Worth saying twice.',
      hashtags: ['dhaka'],
      plannedFor: new Date('2026-10-05T17:30:00Z'),
    });
    await approvePost(ctx, post.id);

    const copy = await duplicatePost(ctx, post.id);
    expect(copy.body).toBe('Worth saying twice.');
    expect(copy.hashtags).toEqual(['dhaka']);
    expect(copy.status).toBe('draft');
    expect(copy.plannedFor).toBeNull();
    expect(copy.id).not.toBe(post.id);
  });
});

describe('deleting', () => {
  it('hides the post but keeps it, so undo is a real undo', async () => {
    const post = await draft('Deleted by accident.');
    await deletePost(ctx, post.id);

    await expect(getPost(ctx, post.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const row = await getUnscopedDb().contentPost.findUnique({ where: { id: post.id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);

    const restored = await restorePost(ctx, post.id);
    expect(restored.body).toBe('Deleted by accident.');
  });

  it('deletes many at once', async () => {
    const first = await draft('One to go.');
    const second = await draft('Another to go.');
    const result = await deletePosts(ctx, [first.id, second.id]);
    expect(result.changed).toBe(2);

    const { total } = await listPosts(ctx);
    expect(total).toBe(0);
  });

  it('will not restore something that was never deleted', async () => {
    const post = await draft('Still here.');
    await expect(restorePost(ctx, post.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listing and filtering', () => {
  it('finds posts by their words', async () => {
    await draft('Biryani on Friday.');
    await draft('Cakes for Eid.');

    const { posts } = await listPosts(ctx, { search: 'biryani' });
    expect(posts.map((post) => post.body)).toEqual(['Biryani on Friday.']);
  });

  it('filters by status', async () => {
    const first = await draft('To approve.');
    await draft('To leave alone.');
    await approvePost(ctx, first.id);

    const { posts, total } = await listPosts(ctx, { status: ['approved'] });
    expect(total).toBe(1);
    expect(posts[0]?.body).toBe('To approve.');
  });

  it('pages through a long list', async () => {
    for (let index = 0; index < 7; index++) await draft(`Post number ${index}.`);

    const first = await listPosts(ctx, { limit: 3 });
    expect(first.posts).toHaveLength(3);
    expect(first.total).toBe(7);
    expect(first.nextCursor).toBeTruthy();

    const second = await listPosts(ctx, { limit: 3, cursor: first.nextCursor! });
    expect(second.posts).toHaveLength(3);
    const ids = new Set([...first.posts, ...second.posts].map((post) => post.id));
    expect(ids.size).toBe(6);

    const third = await listPosts(ctx, { limit: 3, cursor: second.nextCursor! });
    expect(third.posts).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
  });

  it('counts by status for the filter chips', async () => {
    const first = await draft('One.');
    await draft('Two.');
    await approvePost(ctx, first.id);

    expect(await countPostsByStatus(ctx)).toMatchObject({ approved: 1, draft: 1 });
  });

  it('leaves archived posts out unless asked', async () => {
    const post = await draft('Old news.');
    await getUnscopedDb().contentPost.update({
      where: { id: post.id },
      data: { status: 'archived' },
    });

    expect((await listPosts(ctx)).total).toBe(0);
    expect((await listPosts(ctx, { includeArchived: true })).total).toBe(1);
  });
});

describe('the calendar window', () => {
  it('returns the posts planned inside it, in time order', async () => {
    const late = await createPost(ctx, {
      body: 'Late on the fifth, Dhaka time.',
      plannedFor: new Date('2026-10-05T17:30:00Z'),
    });
    const early = await createPost(ctx, {
      body: 'Early on the sixth, Dhaka time.',
      plannedFor: new Date('2026-10-05T21:00:00Z'),
    });
    await createPost(ctx, {
      body: 'Next month.',
      plannedFor: new Date('2026-11-05T10:00:00Z'),
    });
    await draft('Not planned at all.');

    const posts = await listPostsInRange(
      ctx,
      new Date('2026-09-30T18:00:00Z'),
      new Date('2026-10-31T18:00:00Z'),
    );

    expect(posts.map((post) => post.id)).toEqual([late.id, early.id]);
  });
});

describe('isolation between workspaces', () => {
  it('never lists another workspace’s posts', async () => {
    await draft('Ours.');
    await createPost(otherCtx, { body: 'Theirs.' });

    expect((await listPosts(ctx)).posts.map((post) => post.body)).toEqual(['Ours.']);
    expect((await listPosts(otherCtx)).posts.map((post) => post.body)).toEqual(['Theirs.']);
  });

  it('cannot read, edit, approve or delete across workspaces', async () => {
    const mine = await draft('Mine alone.');

    await expect(getPost(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(updatePost(otherCtx, mine.id, { body: 'Hijacked.' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(approvePost(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deletePost(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const still = await getPost(ctx, mine.id);
    expect(still.body).toBe('Mine alone.');
  });

  it('skips foreign ids in a bulk action instead of touching them', async () => {
    const mine = await draft('Mine.');
    const theirs = await createPost(otherCtx, { body: 'Theirs.' });

    const result = await approvePosts(ctx, [mine.id, theirs.id]);
    expect(result.changed).toBe(1);
    expect(result.skipped).toEqual([{ id: theirs.id, reason: 'not found' }]);
    expect((await getPost(otherCtx, theirs.id)).status).toBe('draft');
  });

  it('cannot read another workspace’s revisions', async () => {
    const mine = await draft('First.');
    await updatePost(ctx, mine.id, { body: 'Second.' });
    await expect(listRevisions(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('permissions', () => {
  it('lets a viewer read but not change anything', async () => {
    const post = await draft('Read only.');
    const viewer = await world.createUser();
    await world.addMember(ctx.workspaceId, viewer.id, 'viewer');
    const viewerCtx = await createContext({
      userId: viewer.id,
      workspaceId: ctx.workspaceId,
      emailVerified: true,
      source: 'web',
    });

    await expect(getPost(viewerCtx, post.id)).resolves.toBeDefined();
    await expect(updatePost(viewerCtx, post.id, { body: 'No.' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(approvePost(viewerCtx, post.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(deletePost(viewerCtx, post.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
