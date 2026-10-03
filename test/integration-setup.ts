import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { integrationEnv } from './integration-env';

/**
 * Runs once before the integration tests: applies migrations to the test
 * database and puts the reference data in place. It never resets or drops
 * anything; each test creates its own workspaces and deletes them afterwards.
 *
 * Seeding here, rather than inside each fixture, means the plans exist before
 * any test file starts — instead of several files inserting the same rows at
 * the same moment and one of them losing the race.
 */
export default async function setup() {
  const dbPackage = path.join(import.meta.dirname, '../packages/db');
  const prisma = path.join(dbPackage, 'node_modules/prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
      cwd: dbPackage,
      env: { ...process.env, DATABASE_URL: integrationEnv.DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not prepare the test database. Is Docker running (\`docker compose up -d\`)?\n${output}`,
    );
  }

  // The global setup runs before vitest applies the project's env, so the
  // settings the database client validates have to be set here.
  Object.assign(process.env, integrationEnv);
  // By relative path: this file sits outside the workspace packages, so the
  // `@dpost/db` alias is not resolvable from here.
  const { disconnectDb, getUnscopedDb, seedReferenceData } = await import('../packages/db/src');
  await seedReferenceData(getUnscopedDb());
  await disconnectDb();
}
