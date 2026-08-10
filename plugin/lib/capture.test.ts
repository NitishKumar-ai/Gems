import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureAll, enumerateSessions } from './capture.mjs';

let root: string;
let gemsHome: string;
let claude: string;
let codex: string;
let empty: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gems-scan-'));
  gemsHome = join(root, 'gems');
  claude = join(root, 'claude-projects');
  codex = join(root, 'codex-sessions');
  empty = join(root, 'empty');
  mkdirSync(claude, { recursive: true });
  mkdirSync(codex, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Point every source at an isolated temp dir. The unset ones would otherwise resolve to the real
// ~/.codex, ~/.cursor, process.cwd(), etc. and let this machine's actual transcripts into the test.
function env() {
  return {
    ...process.env,
    GEMS_HOME: gemsHome,
    GEMS_CLAUDE_PROJECTS: claude,
    GEMS_CODEX_SESSIONS: codex,
    GEMS_CURSOR_SESSIONS: empty,
    GEMS_AGY_SESSIONS: empty,
    GEMS_WINDSURF_SESSIONS: empty,
    GEMS_AIDER_SESSIONS: empty,
    GEMS_COPILOT_SESSIONS: empty,
  };
}

function writeClaude(slug: string, sessionId: string, lines: number) {
  mkdirSync(join(claude, slug), { recursive: true });
  const body = Array.from({ length: lines }, (_, i) => JSON.stringify({ type: 'user', n: i })).join('\n');
  writeFileSync(join(claude, slug, `${sessionId}.jsonl`), `${body}\n`);
}

function writeCodexRaw(sessionId: string, body: string) {
  writeFileSync(join(codex, `${sessionId}.jsonl`), body);
}

test('enumerateSessions finds nested Claude and flat Codex transcripts, tagged by source', () => {
  writeClaude('-work-repo', 'claude-1', 3);
  writeCodexRaw('codex-1', JSON.stringify({ type: 'user', n: 0 }) + '\n');

  const found = enumerateSessions(env());
  const byId = Object.fromEntries(found.map((f) => [f.sessionId, f.source]));

  expect(byId['claude-1']).toBe('claude-code');
  expect(byId['codex-1']).toBe('codex');
  expect(found).toHaveLength(2);
});

test('captureAll captures across CLIs, then is idempotent on a re-scan', async () => {
  writeClaude('-work-repo', 'claude-1', 4);
  writeCodexRaw('codex-1', JSON.stringify({ type: 'user', n: 0 }) + '\n');

  const first = await captureAll({ env: env(), now: () => '2026-08-09T00:00:00.000Z' });
  expect(first.captured).toBe(2);
  expect(first.skipped).toBe(0);
  expect(first.sources).toEqual({ 'claude-code': 1, codex: 1 });

  const store = join(gemsHome, 'sessions.jsonl');
  expect(readFileSync(store, 'utf8').trim().split('\n')).toHaveLength(2);

  // Nothing changed on disk, so a second sweep captures nothing new.
  const second = await captureAll({ env: env(), now: () => '2026-08-09T00:01:00.000Z' });
  expect(second.captured).toBe(0);
  expect(second.skipped).toBe(2);
  expect(readFileSync(store, 'utf8').trim().split('\n')).toHaveLength(2);

  // A grown session is a real update and is appended.
  writeClaude('-work-repo', 'claude-1', 9);
  const third = await captureAll({ env: env(), now: () => '2026-08-09T00:02:00.000Z' });
  expect(third.captured).toBe(1);
  expect(readFileSync(store, 'utf8').trim().split('\n')).toHaveLength(3);
});

test('captureAll reads Codex transcripts but stores no content from them', async () => {
  // Same redaction guarantee the single-session path holds, proven for the scan-all path and for a
  // non-Claude source: a Codex transcript carrying a secret and a file path produces a record with
  // neither. The Codex normalizer maps role/model/content onto the shared schema.
  writeCodexRaw(
    'codex-secret',
    [
      JSON.stringify({ role: 'user', content: 'DEPLOY_TOKEN=super-secret-value', timestamp: '2026-08-09T15:00:00.000Z' }),
      JSON.stringify({ role: 'assistant', model: 'gpt-5-codex', content: 'writing to /private/keys.env', timestamp: '2026-08-09T15:00:01.000Z' }),
    ].join('\n') + '\n',
  );

  const result = await captureAll({ env: env() });
  expect(result.captured).toBe(1);

  const stored = readFileSync(join(gemsHome, 'sessions.jsonl'), 'utf8');
  expect(stored).toContain('"source":"codex"');
  expect(stored).not.toContain('super-secret-value');
  expect(stored).not.toContain('DEPLOY_TOKEN');
  expect(stored).not.toContain('keys.env');
});

test('captureAll tolerates a source directory that does not exist', async () => {
  writeClaude('-work-repo', 'claude-only', 3);
  rmSync(codex, { recursive: true, force: true }); // codex dir now missing entirely

  const result = await captureAll({ env: env() });
  expect(result.captured).toBe(1);
  expect(result.sources).toEqual({ 'claude-code': 1 });
});
