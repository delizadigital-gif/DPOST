import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { integrationEnv } from './integration-env';

/**
 * Runs once before the integration tests: applies migrations to the test
 * database. It never resets or drops anything; each test creates its own
 * workspaces and deletes them afterwards.
 */
export default function setup() {
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
}
