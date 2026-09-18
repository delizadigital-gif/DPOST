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
    await db.plan.upsert({
      where: { id: plan.id },
      create: { id: plan.id, ...data },
      update: overwrite ? data : {},
    });
  }
}
