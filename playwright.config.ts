import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// Playwright loads this config as CJS, so no `import.meta` here. Kept in step with
// TEST_DB in tests/e2e/global-setup.ts, which seeds the file this points at.
const TEST_DATABASE_URL = `file:${path.join(process.cwd(), 'tests', 'e2e', '.tmp', 'e2e.db')}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Seeds a published Journey before the first navigation. The profile page reads from the
  // database now, so without this every spec lands on a 404.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    // Never reuse a server the developer already had running: it would be pointed at their
    // own dev.db rather than the seeded fixture, and the specs would fail for a reason that
    // has nothing to do with the code.
    reuseExistingServer: false,
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
});
