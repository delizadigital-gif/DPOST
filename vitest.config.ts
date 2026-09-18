import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { integrationEnv } from './test/integration-env';

const webAliases = {
  '@': path.resolve(import.meta.dirname, 'apps/web/src'),
  // `server-only` throws outside Next's server bundle; tests run on the server anyway.
  'server-only': path.resolve(import.meta.dirname, 'test/empty-module.ts'),
};

/**
 * Two kinds of tests:
 * - Unit (`*.test.ts`): pure logic, no services. `pnpm test:unit`.
 * - Integration (`*.int.test.ts`): real Postgres and Redis from
 *   docker-compose.yml, using a separate test database.
 * `pnpm test` runs both.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/worker/src/**/*.test.ts',
            'apps/web/src/**/*.test.{ts,tsx}',
          ],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
          environment: 'node',
        },
        resolve: { alias: webAliases },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/src/**/*.int.test.ts', 'apps/*/src/**/*.int.test.ts'],
          environment: 'node',
          env: integrationEnv,
          globalSetup: ['./test/integration-setup.ts'],
          testTimeout: 15_000,
        },
        resolve: { alias: webAliases },
      },
    ],
  },
});
