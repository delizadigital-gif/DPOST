import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectDb, getDb, getTenantDb, getUnscopedDb } from './client';
import { TenantScopeError } from './tenant';

/**
 * Tenant isolation against a real database: two workspaces, each with its
 * own data, and every access path tried from the wrong side.
 */
const raw = () => getUnscopedDb();
let workspaceA: string;
let workspaceB: string;
let memoryA: string;
let memoryB: string;

async function createWorkspace(name: string) {
  const workspace = await raw().workspace.create({
    data: { name, slug: `isolation-${randomUUID()}` },
  });
  const memory = await raw().brandMemory.create({
    data: {
      workspaceId: workspace.id,
      content: `${name} secret`,
      category: 'voice',
      source: 'settings',
    },
  });
  return { workspaceId: workspace.id, memoryId: memory.id };
}

beforeAll(async () => {
  ({ workspaceId: workspaceA, memoryId: memoryA } = await createWorkspace('Workspace A'));
  ({ workspaceId: workspaceB, memoryId: memoryB } = await createWorkspace('Workspace B'));
});

afterAll(async () => {
  await raw().workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
  await disconnectDb();
});

describe('guarded client', () => {
  it('refuses tenant queries without a workspace', async () => {
    await expect(getDb().brandMemory.findMany()).rejects.toThrow(TenantScopeError);
    await expect(getDb().brandMemory.findUnique({ where: { id: memoryA } })).rejects.toThrow(
      TenantScopeError,
    );
    await expect(getDb().brandMemory.deleteMany({ where: {} })).rejects.toThrow(TenantScopeError);
  });

  it('allows tenant queries that name the workspace', async () => {
    const rows = await getDb().brandMemory.findMany({ where: { workspaceId: workspaceA } });
    expect(rows.map((row) => row.id)).toEqual([memoryA]);
  });
});

describe('workspace-scoped client', () => {
  it('only sees its own rows', async () => {
    const rows = await getTenantDb(workspaceA).brandMemory.findMany();
    expect(rows.map((row) => row.id)).toEqual([memoryA]);
    expect(await getTenantDb(workspaceA).brandMemory.count()).toBe(1);
  });

  it("cannot read another workspace's row even by ID", async () => {
    const found = await getTenantDb(workspaceA).brandMemory.findUnique({ where: { id: memoryB } });
    expect(found).toBeNull();
  });

  it("cannot update or delete another workspace's rows", async () => {
    const db = getTenantDb(workspaceA);
    await expect(
      db.brandMemory.update({ where: { id: memoryB }, data: { content: 'hijacked' } }),
    ).rejects.toThrow();
    expect(
      (await db.brandMemory.updateMany({ where: { id: memoryB }, data: { content: 'hijacked' } }))
        .count,
    ).toBe(0);
    expect((await db.brandMemory.deleteMany({ where: { id: memoryB } })).count).toBe(0);

    const untouched = await raw().brandMemory.findUniqueOrThrow({ where: { id: memoryB } });
    expect(untouched.content).toBe('Workspace B secret');
  });

  it('creates rows in its own workspace', async () => {
    const created = await getTenantDb(workspaceA).brandMemory.create({
      data: { content: 'new', category: 'other', source: 'chat' } as never,
    });
    expect(created.workspaceId).toBe(workspaceA);
  });

  it('refuses to create or move rows into another workspace', async () => {
    const db = getTenantDb(workspaceA);
    await expect(
      db.brandMemory.create({
        data: { workspaceId: workspaceB, content: 'x', category: 'other', source: 'chat' },
      }),
    ).rejects.toThrow(TenantScopeError);
    await expect(
      db.brandMemory.update({ where: { id: memoryA }, data: { workspaceId: workspaceB } }),
    ).rejects.toThrow(TenantScopeError);
  });

  it('pins the Workspace model to its own workspace', async () => {
    const db = getTenantDb(workspaceA);
    expect((await db.workspace.findUnique({ where: { id: workspaceA } }))?.id).toBe(workspaceA);
    await expect(db.workspace.findUnique({ where: { id: workspaceB } })).rejects.toThrow(
      TenantScopeError,
    );
    await expect(db.workspace.findMany()).rejects.toThrow(TenantScopeError);
    await expect(db.workspace.delete({ where: { id: workspaceA } })).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('keeps scoping inside interactive transactions', async () => {
    const ids = await getTenantDb(workspaceA).$transaction(async (tx) =>
      (await tx.brandMemory.findMany()).map((row) => row.workspaceId),
    );
    expect(new Set(ids)).toEqual(new Set([workspaceA]));
  });
});
