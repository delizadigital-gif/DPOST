/**
 * Tenant isolation for Prisma queries.
 *
 * Two layers, both applied as Prisma client extensions:
 *
 * 1. Guard (`assertTenantScoped`): any query on a tenant-owned model must say
 *    which workspace it's for. A missing filter throws instead of silently
 *    reading or changing every tenant's rows.
 * 2. Scope (`scopeArgs`): a client bound to one workspace adds that
 *    workspace to every query automatically, and refuses queries that name a
 *    different workspace.
 *
 * Known limits (enforced by convention and tests, not by this module):
 * - Nested writes (e.g. `post.create({ data: { revisions: { create: ... } } })`)
 *   into tenant models must set `workspaceId` explicitly. A missing value fails
 *   at the database (NOT NULL); services are responsible for a correct one.
 * - Raw SQL (`$queryRaw`) bypasses both layers and must filter by workspace itself.
 */

/**
 * Models that carry a `workspaceId`. `tenant.test.ts` fails if this list and
 * the Prisma schema ever disagree.
 */
export const TENANT_MODELS = [
  'WorkspaceMember',
  'SocialAccount',
  'SocialChannel',
  'ImportedPost',
  'BrandProfile',
  'BrandMemory',
  'ContentPlan',
  'ContentPost',
  'PostRevision',
  'PostMedia',
  'Publication',
  'PublishAttempt',
  'MediaAsset',
  'AIConversation',
  'AIMessage',
  'AIToolCall',
  'AIUsageEvent',
  'AsyncTask',
  'PostMetricSnapshot',
  'ChannelMetricDaily',
  'Notification',
  'Subscription',
  'UsageCounter',
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

const tenantModels = new Set<string>(TENANT_MODELS);

export function isTenantModel(model: string | undefined): model is TenantModel {
  return model !== undefined && tenantModels.has(model);
}

/** A programming error: a query could have crossed tenant boundaries. */
export class TenantScopeError extends Error {
  constructor(model: string, operation: string, reason: string) {
    super(`Tenant scope violation on ${model}.${operation}: ${reason}`);
    this.name = 'TenantScopeError';
  }
}

type Args = Record<string, unknown>;

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);
const CREATE_OPERATIONS = new Set(['create']);
const CREATE_MANY_OPERATIONS = new Set(['createMany', 'createManyAndReturn']);
const UPDATE_DATA_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

function isObject(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function workspaceIdOf(value: unknown): unknown {
  return isObject(value) ? value.workspaceId : undefined;
}

function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Throws unless the query names exactly one workspace. Only a plain string
 * counts: filters like `{ in: [...] }` are rejected on purpose.
 */
export function assertTenantScoped(model: string, operation: string, rawArgs: unknown): void {
  const args = isObject(rawArgs) ? rawArgs : {};
  const fail = (reason: string) => {
    throw new TenantScopeError(model, operation, reason);
  };

  if (WHERE_OPERATIONS.has(operation)) {
    const workspaceId = workspaceIdOf(args.where);
    if (!isWorkspaceId(workspaceId)) fail('`where.workspaceId` must be a workspace ID');
    if (UPDATE_DATA_OPERATIONS.has(operation)) {
      const target = workspaceIdOf(args.data);
      if (target !== undefined && target !== workspaceId)
        fail('cannot move rows between workspaces');
    }
    return;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    if (!isWorkspaceId(workspaceIdOf(args.data))) fail('`data.workspaceId` is required');
    return;
  }

  if (CREATE_MANY_OPERATIONS.has(operation)) {
    const rows = asArray(args.data);
    if (rows.length === 0 || !rows.every((row) => isWorkspaceId(workspaceIdOf(row)))) {
      fail('every row needs `workspaceId`');
    }
    return;
  }

  if (operation === 'upsert') {
    const workspaceId = workspaceIdOf(args.where);
    if (!isWorkspaceId(workspaceId)) fail('`where.workspaceId` must be a workspace ID');
    if (workspaceIdOf(args.create) !== workspaceId) {
      fail('`create.workspaceId` must match `where.workspaceId`');
    }
    const target = workspaceIdOf(args.update);
    if (target !== undefined && target !== workspaceId) fail('cannot move rows between workspaces');
    return;
  }

  fail('operation is not supported on tenant models');
}

/**
 * Returns query args bound to `workspaceId`. Throws if the caller explicitly
 * names a different workspace, since that is always a bug or an attack.
 */
export function scopeArgs(
  model: string,
  operation: string,
  rawArgs: unknown,
  workspaceId: string,
): Args {
  const args: Args = isObject(rawArgs) ? { ...rawArgs } : {};
  const fail = (reason: string): never => {
    throw new TenantScopeError(model, operation, reason);
  };
  const bind = (value: unknown, field: string): Args => {
    const record = isObject(value) ? value : {};
    const existing = record.workspaceId;
    if (existing !== undefined && existing !== workspaceId) {
      fail(`\`${field}.workspaceId\` names a different workspace`);
    }
    return { ...record, workspaceId };
  };

  if (WHERE_OPERATIONS.has(operation)) {
    args.where = bind(args.where, 'where');
    if (UPDATE_DATA_OPERATIONS.has(operation) && isObject(args.data)) {
      const target = args.data.workspaceId;
      if (target !== undefined && target !== workspaceId)
        fail('cannot move rows between workspaces');
    }
  } else if (CREATE_OPERATIONS.has(operation)) {
    args.data = bind(args.data, 'data');
  } else if (CREATE_MANY_OPERATIONS.has(operation)) {
    args.data = Array.isArray(args.data)
      ? args.data.map((row) => bind(row, 'data'))
      : bind(args.data, 'data');
  } else if (operation === 'upsert') {
    args.where = bind(args.where, 'where');
    args.create = bind(args.create, 'create');
    if (isObject(args.update) && args.update.workspaceId !== undefined) {
      if (args.update.workspaceId !== workspaceId) fail('cannot move rows between workspaces');
    }
  } else {
    fail('operation is not supported on tenant models');
  }

  return args;
}

/**
 * On a workspace-scoped client, the Workspace model itself is limited to the
 * bound workspace: it can be read and updated, never created or deleted.
 */
export function scopeWorkspaceArgs(operation: string, rawArgs: unknown, workspaceId: string): Args {
  const args: Args = isObject(rawArgs) ? { ...rawArgs } : {};
  const readOrUpdate = new Set([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'update',
  ]);
  if (!readOrUpdate.has(operation)) {
    throw new TenantScopeError('Workspace', operation, 'not allowed on a workspace-scoped client');
  }
  const where = isObject(args.where) ? args.where : {};
  if (where.id !== undefined && where.id !== workspaceId) {
    throw new TenantScopeError('Workspace', operation, '`where.id` names a different workspace');
  }
  args.where = { ...where, id: workspaceId };
  return args;
}
