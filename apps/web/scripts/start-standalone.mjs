// Runs the production standalone server exactly as the Docker image does.
// Used by CI end-to-end tests so they exercise the real deployment artifact.
import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneAppDir = path.join(appDir, '.next/standalone/apps/web');
const server = path.join(standaloneAppDir, 'server.js');

if (!existsSync(server)) {
  console.error('No standalone build found. Run `pnpm build` first.');
  process.exit(1);
}

// The standalone output leaves static assets to a CDN; copy them in so
// server.js can serve them itself, as the Dockerfile does.
cpSync(path.join(appDir, '.next/static'), path.join(standaloneAppDir, '.next/static'), {
  recursive: true,
});

const child = spawn(process.execPath, [server], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
