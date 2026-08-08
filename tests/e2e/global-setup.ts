import { execSync } from 'node:child_process';

// Plain .mjs with JSDoc types — the fixture is built by the same code the plugin ships, so a
// change to the journey shape breaks these tests instead of silently drifting from production.
import { buildJourney } from '../../plugin/lib/journey.mjs';
import { E2E_SCHEMA } from '../../playwright.config';

/**
 * The profile page reads a published Journey out of the database, so an E2E run needs a row
 * to exist before the first navigation. Seeding happens here rather than through the import
 * form because that form only regexes a GitHub URL — it has never written a journey, which is
 * why these specs went red the moment the page stopped rendering from a hardcoded mock.
 *
 * This runs against its own Postgres schema, never the developer's data. A test that can
 * scribble on real local data is a test people learn to stop running.
 */
export const TEST_DATABASE_URL = process.env.E2E_DATABASE_URL ?? '';

export const OWNER_API_KEY = 'e2e-owner-key';
export const INTRUDER_API_KEY = 'e2e-intruder-key';
/** An account that signed in before `githubLogin` existed, or whose bind hit a name collision. */
export const UNBOUND_API_KEY = 'e2e-unbound-key';

/** Matches what the capture hook writes, with only the fields the page and rules read. */
function session(id: string, startedAt: string, informed: number) {
  return {
    schema: 2,
    session_id: id,
    captured_at: startedAt,
    metrics: {
      schema: 1,
      started_at: startedAt,
      ended_at: startedAt,
      duration_ms: 600_000,
      models: { 'claude-opus-5': 9, 'claude-sonnet-5': 2 },
      turns: { assistant: 9, synthetic: 0, prompts: 4, commands: 1, records: 40 },
      tokens: { input: 10, output: 100, cache_read: 5, cache_creation: 1 },
      tools: { calls: 60, results: 60, by_name: { Read: 20, Edit: 15, Bash: 15, Grep: 10 } },
      evidence_before_edit: { edits: 12, informed, blind: 12 - informed, creates: 1, verify_calls: 9 },
      steering: { prompts: 4, commands: 1, interrupts: 2, turns_per_prompt: 1.8 },
      invalid_actions: { tool_calls: 60, tool_failures: 0, rate: 0, api_errors: 0, by_signal: {} },
      sidechain_records: 0,
      unparsable_lines: 0,
    },
  };
}

/**
 * Sixteen sessions across sixteen days: enough to clear the trend threshold and to earn
 * several achievements, so the profile renders every section the specs assert on. The
 * informed-edit count steps up halfway through, which is what makes the trend positive.
 */
export function fixtureJourney() {
  const sessions = Array.from({ length: 16 }, (_, i) =>
    session(`s${i}`, `2026-06-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`, i < 8 ? 7 : 12),
  );
  return buildJourney(sessions);
}

async function globalSetup() {
  if (!TEST_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL was not set by playwright.config.ts');
  }

  const { PrismaClient } = await import('@prisma/client');

  // Drop and recreate the schema so a run never inherits rows from the last one. Done through a
  // client on the *default* schema, because the target may not exist yet and connecting into a
  // missing schema is not how Postgres works.
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    // E2E_SCHEMA is a module constant, never user input, so interpolating it here cannot carry
    // anything a caller supplied. `$executeRawUnsafe` is required either way: Postgres does not
    // accept a bind parameter in place of an identifier.
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${E2E_SCHEMA}"`);
  } finally {
    await admin.$disconnect();
  }

  // `migrate deploy`, not `db push`: it applies the same migrations production will run, so a
  // migration that is broken or missing fails here rather than after a deploy.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

  try {
    // `githubLogin` is what a journey publishes under, so it has to match the `username` the
    // publish specs post with — the endpoint derives the target from this column, not the body.
    const owner = await prisma.user.create({
      data: { email: 'e2e@example.com', name: 'E2E', apiKey: OWNER_API_KEY, githubLogin: 'owner' },
    });

    // A second account with a perfectly valid key. Publishing is authorized by API key while the
    // target profile is named in the request body, so "valid key, someone else's profile" is a
    // real state the endpoint has to refuse — it needs a real second user to test against.
    await prisma.user.create({
      data: {
        email: 'intruder@example.com',
        name: 'Intruder',
        apiKey: INTRUDER_API_KEY,
        githubLogin: 'intruder',
      },
    });

    // Deliberately has no handle. Every account looked like this before the sign-in binding
    // existed, and publishing under an unverified name is exactly what this phase closes.
    await prisma.user.create({
      data: { email: 'unbound@example.com', name: 'Unbound', apiKey: UNBOUND_API_KEY },
    });

    // Read-only fixture for the profile-rendering specs. Nothing may publish over it.
    await prisma.journey.create({
      data: {
        userId: owner.id,
        username: 'testuser',
        repo: 'testrepo',
        metrics: JSON.stringify(fixtureJourney()),
      },
    });

    // Separate target for the publish specs, which mutate what they point at. Sharing one row
    // with the profile specs made them race under fullyParallel and fail on whichever ran second.
    await prisma.journey.create({
      data: {
        userId: owner.id,
        username: 'owner',
        repo: 'publishtarget',
        metrics: JSON.stringify(fixtureJourney()),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
