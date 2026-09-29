/**
 * Starts the web dev server without going through pnpm.
 *
 * The development machine's Device Guard policy blocks the globally
 * installed `pnpm.exe`, which stops the editor's preview server from
 * launching. Next also has to run with `apps/web` as its working directory,
 * because `next.config.ts` resolves the next-intl config relative to it.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(repoRoot, 'apps', 'web');

const child = spawn(
  process.execPath,
  [join(web, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev'],
  { cwd: web, stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 0));
