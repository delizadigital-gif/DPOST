import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Local development uses one `.env` at the repo root, shared with the worker.
// Variables already set in the environment (e.g. by the host) take precedence.
const rootEnvFile = path.join(monorepoRoot, '.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile.web).
  output: 'standalone',
  // Trace files from the whole monorepo so workspace packages are included.
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
