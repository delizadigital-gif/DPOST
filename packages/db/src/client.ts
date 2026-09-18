import { PrismaPg } from '@prisma/adapter-pg';
import { getServerEnv } from '@dpost/config';
import { PrismaClient } from './generated/prisma/client';
import {
  assertTenantScoped,
  isTenantModel,
  scopeArgs,
  scopeWorkspaceArgs,
  TenantScopeError,
} from './tenant';

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Adds the tenant guard: tenant-model queries without a workspace throw. */
export function withTenantGuard(client: PrismaClient) {
  return client.$extends({
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (isTenantModel(model)) assertTenantScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });
}

/** A client bound to one workspace: every tenant query is scoped automatically. */
export function withTenantScope(client: PrismaClient, workspaceId: string) {
  if (!workspaceId) throw new TenantScopeError('*', 'scope', 'workspaceId is required');
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (isTenantModel(model)) return query(scopeArgs(model, operation, args, workspaceId));
          if (model === 'Workspace') return query(scopeWorkspaceArgs(operation, args, workspaceId));
          return query(args);
        },
      },
    },
  });
}

export type GuardedDb = ReturnType<typeof withTenantGuard>;
export type TenantDb = ReturnType<typeof withTenantScope>;

// One connection pool per process. In development, Next.js hot reloading
// re-evaluates modules, so the client is kept on globalThis to avoid
// opening a new pool on every edit.
const globalForDb = globalThis as unknown as { __dpostPrisma?: PrismaClient };

/**
 * The raw client with no tenant protection. Only for code that is
 * legitimately cross-tenant: auth, the audit log, platform admin and
 * system jobs. Everything else uses `getDb()` or `getTenantDb()`.
 */
export function getUnscopedDb(): PrismaClient {
  if (!globalForDb.__dpostPrisma) {
    const { DATABASE_URL } = getServerEnv();
    globalForDb.__dpostPrisma = createPrismaClient(DATABASE_URL);
  }
  return globalForDb.__dpostPrisma;
}

let guarded: GuardedDb | undefined;

/** The default client: tenant queries must name their workspace explicitly. */
export function getDb(): GuardedDb {
  guarded ??= withTenantGuard(getUnscopedDb());
  return guarded;
}

/** A client bound to `workspaceId`. Cheap to create; build one per request or job. */
export function getTenantDb(workspaceId: string): TenantDb {
  return withTenantScope(getUnscopedDb(), workspaceId);
}

export async function disconnectDb(): Promise<void> {
  await globalForDb.__dpostPrisma?.$disconnect();
  globalForDb.__dpostPrisma = undefined;
  guarded = undefined;
}
