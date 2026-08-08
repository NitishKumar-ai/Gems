import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Playwright does not read `.env`, but Next and the Prisma CLI both do — so without this the
// suite would be the one place in the project that needs `DATABASE_URL` exported by hand. This is
// the same loader Next itself uses, already present as one of its dependencies.
loadEnvConfig(process.cwd());

/**
 * The suite runs against its own Postgres *schema*, never the developer's. It is derived from
 * whatever `DATABASE_URL` is already configured — same server, same credentials, different
 * namespace — so running the tests needs no second setting locally, and CI only has to point
 * `DATABASE_URL` at its service container.
 *
 * A fixed schema name rather than one per run: a unique name would need teardown to stop schemas
 * accumulating forever, and `global-setup.ts` drops and recreates this one on every run, which is
 * the same guarantee the old `rmSync` of the SQLite file gave. Two concurrent runs on one machine
 * would collide, which was equally true of the single hardcoded file path before.
 */
export const E2E_SCHEMA = 'e2e';

function testDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres server; ' +
        'the E2E suite derives its own schema from it.',
    );
  }

  const url = new URL(base);
  url.searchParams.set('schema', E2E_SCHEMA);
  return url.toString();
}

const TEST_DATABASE_URL = testDatabaseUrl();

// global-setup.ts and the dev server both need the same value, and the setup runs in this
// process. Passing it through the environment keeps one definition rather than two that can drift.
process.env.E2E_DATABASE_URL = TEST_DATABASE_URL;

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
    // own database rather than the seeded fixture, and the specs would fail for a reason that
    // has nothing to do with the code.
    reuseExistingServer: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      // Point the landing CTA at the seeded fixture rather than the production profile, so the
      // spec asserts against a journey global-setup.ts controls.
      NEXT_PUBLIC_GEMS_DEMO_PROFILE: '/testuser/testrepo',
    },
  },
});
