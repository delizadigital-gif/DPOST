import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Tablet width in Chrome: the iPad profiles default to WebKit, which
    // would mean downloading a second browser engine for one breakpoint.
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // CI tests the production build (built in an earlier step); locally we
  // reuse a running dev server if there is one.
  webServer: {
    command: isCI ? 'pnpm start' : 'pnpm dev',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
