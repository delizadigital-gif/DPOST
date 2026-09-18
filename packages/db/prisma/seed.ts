// Run with `pnpm --filter @dpost/db seed` (Prisma calls this via prisma.config.ts).
import { createPrismaClient } from '../src/client';
import { seedReferenceData } from '../src/seed';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = createPrismaClient(url);
try {
  await seedReferenceData(db);
  process.stdout.write('Seeded reference data (plans).\n');
} finally {
  await db.$disconnect();
}
