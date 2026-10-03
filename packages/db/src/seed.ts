import type { PrismaClient } from './generated/prisma/client';
import { PLAN_CATALOGUE } from './plans';

/**
 * Idempotent reference data every environment needs. Safe to run on every
 * deploy: plans are upserted, never deleted, and existing limits are only
 * overwritten by this catalogue when `overwrite` is true.
 */
export async function seedReferenceData(
  db: PrismaClient,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<void> {
  for (const plan of PLAN_CATALOGUE) {
    const data = {
      name: plan.name,
      sortOrder: plan.sortOrder,
      limits: { ...plan.limits },
      prices: plan.prices.map((price) => ({ ...price })),
    };
    try {
      await db.plan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...data },
        update: overwrite ? data : {},
      });
    } catch (error) {
      // Two seeders racing the same row: an upsert is not a lock, so Postgres
      // raises a unique violation. The row now exists, which is all this
      // function promised — unless an overwrite was asked for, in which case
      // the write still has to land.
      if (!isUniqueViolation(error)) throw error;
      if (overwrite) await db.plan.update({ where: { id: plan.id }, data });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
