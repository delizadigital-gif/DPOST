import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectDb, getUnscopedDb } from '@dpost/db';
import { createContext } from './context';
import { getMe } from './services/account';
import { recordAudit } from './services/audit';
import { createTestWorld } from './testing/fixtures';

const world = createTestWorld();
let alice: { id: string };
let bob: { id: string };
let aliceWorkspace: string;
let bobWorkspace: string;

beforeAll(async () => {
  alice = await world.createUser('Alice');
  bob = await world.createUser('Bob');
  aliceWorkspace = (await world.createWorkspace({ owner: alice, name: "Alice's Shop" })).id;
  bobWorkspace = (await world.createWorkspace({ owner: bob, name: "Bob's Bakery" })).id;
});

afterAll(async () => {
  await world.cleanup();
  await disconnectDb();
});

describe('createContext', () => {
  it("resolves the user's membership and role", async () => {
    const ctx = await createContext({
      userId: alice.id,
      workspaceId: aliceWorkspace,
      source: 'web',
    });
    expect(ctx).toMatchObject({ userId: alice.id, workspaceId: aliceWorkspace, role: 'owner' });
    expect(ctx.requestId).toMatch(/^req_/);
  });

  it("falls back to the user's first workspace", async () => {
    const ctx = await createContext({ userId: alice.id, source: 'web' });
    expect(ctx.workspaceId).toBe(aliceWorkspace);
  });

  it("refuses a workspace the user doesn't belong to", async () => {
    await expect(
      createContext({ userId: alice.id, workspaceId: bobWorkspace, source: 'web' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reports a user without any workspace', async () => {
    const loner = await world.createUser('Loner');
    await expect(createContext({ userId: loner.id, source: 'web' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('uses the role from the membership', async () => {
    const viewer = await world.createUser('Viewer');
    await world.addMember(aliceWorkspace, viewer.id, 'viewer');
    const ctx = await createContext({
      userId: viewer.id,
      workspaceId: aliceWorkspace,
      source: 'web',
    });
    expect(ctx.role).toBe('viewer');
  });
});

describe('getMe', () => {
  it('returns the user, workspace, role and plan', async () => {
    const ctx = await createContext({ userId: alice.id, source: 'web' });
    const me = await getMe(ctx);
    expect(me.user).toMatchObject({ id: alice.id, name: 'Alice' });
    expect(me.workspace).toMatchObject({
      id: aliceWorkspace,
      name: "Alice's Shop",
      timezone: 'Asia/Dhaka',
    });
    expect(me.role).toBe('owner');
    expect(me.plan?.id).toBe('free');
  });

  it('exposes only whitelisted fields', async () => {
    const me = await getMe(await createContext({ userId: alice.id, source: 'web' }));
    expect(Object.keys(me.user).sort()).toEqual(['email', 'emailVerified', 'id', 'locale', 'name']);
    expect(Object.keys(me.workspace).sort()).toEqual(['id', 'locale', 'name', 'slug', 'timezone']);
  });
});

describe('recordAudit', () => {
  it('records who did what, from which entry point', async () => {
    const ctx = await createContext({ userId: alice.id, source: 'agent', ip: '203.0.113.7' });
    await recordAudit(ctx, {
      action: 'post.delete',
      targetType: 'content_post',
      targetId: 'post_1',
      metadata: { count: 1 },
    });
    const entry = await getUnscopedDb().auditLog.findFirstOrThrow({
      where: { requestId: ctx.requestId },
    });
    expect(entry).toMatchObject({
      workspaceId: aliceWorkspace,
      actorUserId: alice.id,
      actorType: 'agent',
      action: 'post.delete',
      targetId: 'post_1',
      ip: '203.0.113.7',
      metadata: { count: 1 },
    });
  });
});
