import { defineConfig } from 'tsup';

// The worker ships as a self-contained dist/ folder: workspace packages and
// npm dependencies are all bundled (Prisma's query engine becomes a separate
// lazy-loaded chunk), so the Docker image needs no node_modules.
// Packages with native binaries (e.g. sharp in Phase 9) must be listed in
// `external` and installed in the image instead.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  // CommonJS dependencies (e.g. pino) call require() for Node built-ins,
  // which an ES module bundle doesn't provide on its own.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
