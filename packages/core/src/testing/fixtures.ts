import { randomUUID } from 'node:crypto';
import { getUnscopedDb, seedReferenceData, type WorkspaceRole } from '@dpost/db';

/**
 * Integration-test data. Every call creates fresh, uniquely named rows, so
 * test files can run in parallel against one database without interfering.
 * `cleanup()` deletes everything the fixture created (workspace deletes
 * cascade to all tenant data).
 */
export interface TestWorld {
  createUser(name?: string): Promise<{ id: string; email: string }>;
  createWorkspace(options?: {
    owner?: { id: string };
    name?: string;
  }): Promise<{ id: string; ownerId: string }>;
  addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  cleanup(): Promise<void>;
}

export function createTestWorld(): TestWorld {
  const db = getUnscopedDb();
  const userIds: string[] = [];
  const workspaceIds: string[] = [];

  const world: TestWorld = {
    async createUser(name = 'Test User') {
      const id = `test_${randomUUID()}`;
      const email = `${id}@example.test`;
      await db.user.create({ data: { id, name, email, emailVerified: true } });
      userIds.push(id);
      return { id, email };
    },

    async createWorkspace({ owner, name = 'Test Workspace' } = {}) {
      await seedReferenceData(db);
      const ownerId = owner?.id ?? (await world.createUser()).id;
      const now = new Date();
      const workspace = await db.workspace.create({
        data: {
          name,
          slug: `test-${randomUUID()}`,
          members: { create: { userId: ownerId, role: 'owner' } },
          subscription: {
            create: {
              planId: 'free',
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });
      workspaceIds.push(workspace.id);
      return { id: workspace.id, ownerId };
    },

    async addMember(workspaceId, userId, role) {
      await db.workspaceMember.create({ data: { workspaceId, userId, role } });
    },

    async cleanup() {
      await db.auditLog.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
  return world;
}
