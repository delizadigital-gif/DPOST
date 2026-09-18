import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env files. Locally we use the single repo-root
// .env; in CI and production the variables come from the environment.
const rootEnvFile = path.join(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so an unset URL is allowed
    // here; commands that do need one fail with Prisma's own clear error.
    url: process.env.DATABASE_URL ?? '',
  },
});
