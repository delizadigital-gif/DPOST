import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Lint config for packages/* and apps/worker. apps/web has its own config
// built on eslint-config-next.
export default defineConfig([
  globalIgnores([
    '**/generated/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    'apps/web/**',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
]);
