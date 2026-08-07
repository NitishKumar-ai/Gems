import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendRecord,
  buildRecord,
  capture,
  isSafeSessionId,
  locateTranscript,
  measureTranscript,
  parseHookInput,
  projectSlug,
  SCHEMA_VERSION,
} from './capture-session.mjs';

let root: string;
let gemsHome: string;
let projects: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gems-test-'));
  gemsHome = join(root, 'gems');
  projects = join(root, 'projects');
  mkdirSync(projects, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function env() {
  return { ...process.env, GEMS_HOME: gemsHome, GEMS_CLAUDE_PROJECTS: projects };
}

function writeTranscript(slug: string, sessionId: string, lines: number) {
  mkdirSync(join(projects, slug), { recursive: true });
  const path = join(projects, slug, `${sessionId}.jsonl`);
  const body = Array.from({ length: lines }, (_, i) => JSON.stringify({ type: 'user', n: i })).join('\n');
  writeFileSync(path, `${body}\n`);
  return path;
}

test('projectSlug flattens separators and dots the way Claude Code does', () => {
  expect(projectSlug('/Volumes/NIT-SSD/Development/Gems')).toBe('-Volumes-NIT-SSD-Development-Gems');
  expect(projectSlug('/Users/x/Development/Class-mode/.claude/worktrees/a')).toBe(
    '-Users-x-Development-Class-mode--claude-worktrees-a',
  );
  expect(projectSlug('')).toBeNull();
  expect(projectSlug(undefined)).toBeNull();
});

test('isSafeSessionId rejects path traversal and empty input', () => {
  expect(isSafeSessionId('5f635de0-5141-4f36-a59f-b1331315bafb')).toBe(true);
  expect(isSafeSessionId('../../etc/passwd')).toBe(false);
  expect(isSafeSessionId('a/b')).toBe(false);
  expect(isSafeSessionId('')).toBe(false);
  expect(isSafeSessionId(null)).toBe(false);
});

test('parseHookInput tolerates junk without throwing', () => {
  expect(parseHookInput('{"session_id":"abc"}')).toEqual({ session_id: 'abc' });
  expect(parseHookInput('')).toBeNull();
  expect(parseHookInput('   ')).toBeNull();
  expect(parseHookInput('not json')).toBeNull();
  expect(parseHookInput('"a string"')).toBeNull();
  expect(parseHookInput(undefined)).toBeNull();
});

test('locateTranscript uses the cwd-derived slug when it matches', () => {
  const expected = writeTranscript('-work-repo', 'sess-1', 3);
  expect(locateTranscript('sess-1', '/work/repo', projects)).toBe(expected);
});

test('locateTranscript falls back to scanning when the slug does not match', () => {
  const expected = writeTranscript('-somewhere-else', 'sess-2', 3);
  expect(locateTranscript('sess-2', '/work/repo', projects)).toBe(expected);
});

test('locateTranscript returns null for unknown sessions and unsafe ids', () => {
  writeTranscript('-work-repo', 'sess-3', 1);
  expect(locateTranscript('nope', '/work/repo', projects)).toBeNull();
  expect(locateTranscript('../escape', '/work/repo', projects)).toBeNull();
  expect(locateTranscript('sess-3', '/work/repo', join(root, 'missing'))).toBeNull();
});

test('capture writes a pointer record with counts', async () => {
  writeTranscript('-work-repo', 'sess-4', 5);

  const result = await capture({
    raw: JSON.stringify({ session_id: 'sess-4', cwd: '/work/repo' }),
    env: env(),
    now: () => '2026-08-07T00:00:00.000Z',
  });

  expect(result.captured).toBe(true);
  expect(result.record).toBeDefined();
  expect(result.record!).toMatchObject({
    schema: SCHEMA_VERSION,
    source: 'claude-code',
    session_id: 'sess-4',
    cwd: '/work/repo',
    project_slug: '-work-repo',
    captured_at: '2026-08-07T00:00:00.000Z',
    lines: 5,
  });
  expect(result.record!.bytes).toBeGreaterThan(0);

  const stored = readFileSync(join(gemsHome, 'sessions.jsonl'), 'utf8').trim().split('\n');
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0]).session_id).toBe('sess-4');
});

test('capture stores nothing but the pointer — no transcript content leaks', async () => {
  mkdirSync(join(projects, '-work-repo'), { recursive: true });
  writeFileSync(
    join(projects, '-work-repo', 'sess-secret.jsonl'),
    `${JSON.stringify({ type: 'user', message: { content: 'MY_API_KEY=super-secret-value' } })}\n`,
  );

  await capture({ raw: JSON.stringify({ session_id: 'sess-secret', cwd: '/work/repo' }), env: env() });

  const stored = readFileSync(join(gemsHome, 'sessions.jsonl'), 'utf8');
  expect(stored).not.toContain('super-secret-value');
  expect(stored).not.toContain('MY_API_KEY');
});

test('capture is idempotent for an unchanged session but records growth', async () => {
  writeTranscript('-work-repo', 'sess-5', 2);
  const store = join(gemsHome, 'sessions.jsonl');

  const first = await capture({ raw: JSON.stringify({ session_id: 'sess-5', cwd: '/work/repo' }), env: env() });
  expect(first.captured).toBe(true);

  const second = await capture({ raw: JSON.stringify({ session_id: 'sess-5', cwd: '/work/repo' }), env: env() });
  expect(second.captured).toBe(false);
  expect(readFileSync(store, 'utf8').trim().split('\n')).toHaveLength(1);

  // A resumed session ends larger than it did before; that is a real update.
  writeTranscript('-work-repo', 'sess-5', 9);
  const third = await capture({ raw: JSON.stringify({ session_id: 'sess-5', cwd: '/work/repo' }), env: env() });
  expect(third.captured).toBe(true);
  expect(readFileSync(store, 'utf8').trim().split('\n')).toHaveLength(2);
});

test('capture accepts conversation_id as an alias for session_id', async () => {
  writeTranscript('-work-repo', 'sess-6', 1);
  const result = await capture({ raw: JSON.stringify({ conversation_id: 'sess-6', cwd: '/work/repo' }), env: env() });
  expect(result.captured).toBe(true);
  expect(result.record!.session_id).toBe('sess-6');
});

test('capture degrades quietly on bad input instead of throwing', async () => {
  const noId = await capture({ raw: '{}', env: env() });
  expect(noId).toEqual({ captured: false, reason: 'no-session-id' });

  const junk = await capture({ raw: 'not json at all', env: env() });
  expect(junk.captured).toBe(false);

  const missing = await capture({ raw: JSON.stringify({ session_id: 'ghost', cwd: '/work/repo' }), env: env() });
  expect(missing).toEqual({ captured: false, reason: 'no-transcript' });

  // Failures are diagnosable, and the store was never created for them.
  expect(existsSync(join(gemsHome, 'capture.log'))).toBe(true);
  expect(existsSync(join(gemsHome, 'sessions.jsonl'))).toBe(false);
});

test('measureTranscript returns bytes and lines from a single pass', async () => {
  const path = writeTranscript('-work-repo', 'sess-measure', 7);
  const measured = await measureTranscript(path);
  expect(measured).not.toBeNull();
  expect(measured!.lines).toBe(7);
  expect(measured!.bytes).toBe(statSync(path).size);
});

test('measureTranscript returns null for an unreadable path', async () => {
  expect(await measureTranscript(join(root, 'does-not-exist.jsonl'))).toBeNull();
});

test('capture skips the line count when the transcript is too large to walk', async () => {
  writeTranscript('-work-repo', 'sess-big', 4);

  const result = await capture({
    raw: JSON.stringify({ session_id: 'sess-big', cwd: '/work/repo' }),
    env: env(),
    maxLineCountBytes: 1,
  });

  expect(result.captured).toBe(true);
  // Bytes still recorded, line count deliberately skipped rather than walked.
  expect(result.record!.bytes).toBeGreaterThan(1);
  expect(result.record!.lines).toBeNull();
});

test('a directory named like a transcript is not mistaken for one', async () => {
  const path = writeTranscript('-work-repo', 'sess-dir', 3);
  rmSync(path, { force: true });
  mkdirSync(path, { recursive: true });

  expect(locateTranscript('sess-dir', '/work/repo', projects)).toBeNull();

  const result = await capture({ raw: JSON.stringify({ session_id: 'sess-dir', cwd: '/work/repo' }), env: env() });

  // Without the isFile guard this recorded the directory's own size as a transcript.
  expect(result).toEqual({ captured: false, reason: 'no-transcript' });
  expect(existsSync(join(gemsHome, 'sessions.jsonl'))).toBe(false);
});

test('diagnostics log is bounded instead of growing without limit', async () => {
  mkdirSync(gemsHome, { recursive: true });
  const log = join(gemsHome, 'capture.log');
  writeFileSync(log, `${Array.from({ length: 600 }, (_, i) => `old line ${i}`).join('\n')}\n`);

  await capture({ raw: '{}', env: env() });

  const lines = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  expect(lines.length).toBeLessThanOrEqual(500);
  expect(lines[lines.length - 1]).toContain('no usable session id');
});

test('appendRecord still dedupes against a large existing store', () => {
  mkdirSync(gemsHome, { recursive: true });
  const store = join(gemsHome, 'sessions.jsonl');

  // Enough history that the dedupe read starts at a non-zero file offset.
  const filler = Array.from({ length: 2000 }, (_, i) =>
    JSON.stringify(
      buildRecord({
        sessionId: `old-${i}`,
        cwd: '/work/repo',
        transcriptPath: '/tmp/x.jsonl',
        bytes: i,
        lines: 1,
        capturedAt: '2026-08-01T00:00:00.000Z',
      }),
    ),
  ).join('\n');
  writeFileSync(store, `${filler}\n`);

  const recent = buildRecord({
    sessionId: 'old-1999',
    cwd: '/work/repo',
    transcriptPath: '/tmp/x.jsonl',
    bytes: 1999,
    lines: 1,
    capturedAt: '2026-08-01T00:00:00.000Z',
  });

  expect(appendRecord(store, recent)).toBe(false);
});

test('appendRecord survives a corrupt line already in the store', () => {
  mkdirSync(gemsHome, { recursive: true });
  const store = join(gemsHome, 'sessions.jsonl');
  writeFileSync(store, 'this is not json\n');

  const record = buildRecord({
    sessionId: 'sess-7',
    cwd: '/work/repo',
    transcriptPath: '/tmp/x.jsonl',
    bytes: 10,
    lines: 1,
    capturedAt: '2026-08-07T00:00:00.000Z',
  });

  expect(appendRecord(store, record)).toBe(true);
  expect(readFileSync(store, 'utf8')).toContain('sess-7');
});
