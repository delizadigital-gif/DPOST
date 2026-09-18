import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertTenantScoped,
  scopeArgs,
  scopeWorkspaceArgs,
  TENANT_MODELS,
  TenantScopeError,
} from './tenant';

const WS_A = '0190a000-0000-7000-8000-00000000000a';
const WS_B = '0190a000-0000-7000-8000-00000000000b';

describe('TENANT_MODELS', () => {
  it('lists exactly the schema models that have a workspaceId column', () => {
    const schema = readFileSync(path.join(import.meta.dirname, '../prisma/schema.prisma'), 'utf8');
    const modelsWithWorkspaceId = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+workspaceId\s+String\b/m.test(body ?? ''))
      .map(([, name]) => name)
      // AuditLog's workspaceId is optional: platform-admin actions have none.
      .filter((name) => name !== 'AuditLog');

    expect([...TENANT_MODELS].sort()).toEqual(modelsWithWorkspaceId.sort());
  });
});

describe('assertTenantScoped', () => {
  it('accepts reads and writes that name one workspace', () => {
    expect(() =>
      assertTenantScoped('ContentPost', 'findMany', { where: { workspaceId: WS_A } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('ContentPost', 'findUnique', { where: { id: 'p1', workspaceId: WS_A } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('ContentPost', 'create', { data: { workspaceId: WS_A, body: 'x' } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('ContentPost', 'createMany', {
        data: [{ workspaceId: WS_A }, { workspaceId: WS_A }],
      }),
    ).not.toThrow();
  });

  it.each([
    ['findMany', {}],
    ['findMany', { where: { status: 'draft' } }],
    ['findUnique', { where: { id: 'p1' } }],
    ['count', undefined],
    ['updateMany', { where: {}, data: { status: 'approved' } }],
    ['deleteMany', { where: { id: { in: ['a', 'b'] } } }],
    ['create', { data: { body: 'x' } }],
    ['createMany', { data: [{ workspaceId: WS_A }, { body: 'no workspace' }] }],
    ['createMany', { data: [] }],
  ])('rejects %s without a workspace (%j)', (operation, args) => {
    expect(() => assertTenantScoped('ContentPost', operation, args)).toThrow(TenantScopeError);
  });

  it('rejects filter objects instead of a single workspace ID', () => {
    expect(() =>
      assertTenantScoped('ContentPost', 'findMany', {
        where: { workspaceId: { in: [WS_A, WS_B] } },
      }),
    ).toThrow(TenantScopeError);
  });

  it('rejects moving rows to another workspace', () => {
    expect(() =>
      assertTenantScoped('ContentPost', 'update', {
        where: { id: 'p1', workspaceId: WS_A },
        data: { workspaceId: WS_B },
      }),
    ).toThrow(/move rows/);
  });

  it('requires upserts to create in the same workspace they look in', () => {
    expect(() =>
      assertTenantScoped('UsageCounter', 'upsert', {
        where: { workspaceId: WS_A },
        create: { workspaceId: WS_A },
        update: {},
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('UsageCounter', 'upsert', {
        where: { workspaceId: WS_A },
        create: { workspaceId: WS_B },
        update: {},
      }),
    ).toThrow(TenantScopeError);
  });
});

describe('scopeArgs', () => {
  it('adds the workspace to filters and new rows', () => {
    expect(scopeArgs('ContentPost', 'findMany', { where: { status: 'draft' } }, WS_A)).toEqual({
      where: { status: 'draft', workspaceId: WS_A },
    });
    expect(scopeArgs('ContentPost', 'findMany', undefined, WS_A)).toEqual({
      where: { workspaceId: WS_A },
    });
    expect(scopeArgs('ContentPost', 'create', { data: { body: 'x' } }, WS_A)).toEqual({
      data: { body: 'x', workspaceId: WS_A },
    });
    expect(
      scopeArgs('ContentPost', 'createMany', { data: [{ body: 'a' }, { body: 'b' }] }, WS_A),
    ).toEqual({
      data: [
        { body: 'a', workspaceId: WS_A },
        { body: 'b', workspaceId: WS_A },
      ],
    });
  });

  it('does not mutate the caller’s args', () => {
    const args = { where: { status: 'draft' } };
    scopeArgs('ContentPost', 'findMany', args, WS_A);
    expect(args).toEqual({ where: { status: 'draft' } });
  });

  it('refuses queries that name a different workspace', () => {
    expect(() =>
      scopeArgs('ContentPost', 'findMany', { where: { workspaceId: WS_B } }, WS_A),
    ).toThrow(TenantScopeError);
    expect(() => scopeArgs('ContentPost', 'create', { data: { workspaceId: WS_B } }, WS_A)).toThrow(
      TenantScopeError,
    );
    expect(() =>
      scopeArgs(
        'ContentPost',
        'update',
        { where: { id: 'p1' }, data: { workspaceId: WS_B } },
        WS_A,
      ),
    ).toThrow(TenantScopeError);
  });

  it('scopes both sides of an upsert', () => {
    expect(
      scopeArgs('UsageCounter', 'upsert', { where: { metric: 'm' }, create: {}, update: {} }, WS_A),
    ).toEqual({
      where: { metric: 'm', workspaceId: WS_A },
      create: { workspaceId: WS_A },
      update: {},
    });
  });
});

describe('scopeWorkspaceArgs', () => {
  it('pins Workspace reads and updates to the bound workspace', () => {
    expect(scopeWorkspaceArgs('findUnique', { where: {} }, WS_A)).toEqual({ where: { id: WS_A } });
    expect(scopeWorkspaceArgs('update', { where: { id: WS_A }, data: {} }, WS_A)).toEqual({
      where: { id: WS_A },
      data: {},
    });
  });

  it('refuses other workspaces and lifecycle operations', () => {
    expect(() => scopeWorkspaceArgs('findUnique', { where: { id: WS_B } }, WS_A)).toThrow(
      TenantScopeError,
    );
    for (const operation of ['findMany', 'create', 'delete', 'deleteMany', 'updateMany']) {
      expect(() => scopeWorkspaceArgs(operation, {}, WS_A)).toThrow(TenantScopeError);
    }
  });
});
