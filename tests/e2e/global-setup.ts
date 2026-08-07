import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Plain .mjs with JSDoc types — the fixture is built by the same code the plugin ships, so a
// change to the journey shape breaks these tests instead of silently drifting from production.
import { buildJourney } from '../../plugin/lib/journey.mjs';

/**
 * The profile page reads a published Journey out of the database, so an E2E run needs a row
 * to exist before the first navigation. Seeding happens here rather than through the import
 * form because that form only regexes a GitHub URL — it has never written a journey, which is
 * why these specs went red the moment the page stopped rendering from a hardcoded mock.
 *
 * This runs against its own database file, never the developer's `dev.db`. A test that can
 * scribble on real local data is a test people learn to stop running.
 */
export const TEST_DB = join(process.cwd(), 'tests', 'e2e', '.tmp', 'e2e.db');
export const TEST_DATABASE_URL = `file:${TEST_DB}`;

export const OWNER_API_KEY = 'e2e-owner-key';
export const INTRUDER_API_KEY = 'e2e-intruder-key';

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
  mkdirSync(dirname(TEST_DB), { recursive: true });
  rmSync(TEST_DB, { force: true });

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

  try {
    const owner = await prisma.user.create({
      data: { email: 'e2e@example.com', name: 'E2E', apiKey: OWNER_API_KEY },
    });

    // A second account with a perfectly valid key. Publishing is authorized by API key while the
    // target profile is named in the request body, so "valid key, someone else's profile" is a
    // real state the endpoint has to refuse — it needs a real second user to test against.
    await prisma.user.create({
      data: { email: 'intruder@example.com', name: 'Intruder', apiKey: INTRUDER_API_KEY },
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
