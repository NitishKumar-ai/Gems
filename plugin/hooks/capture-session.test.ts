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

test('capture reads the transcript but stores no content from it', async () => {
  // This assertion carries much more weight than it did in Phase 1, where nothing read the
  // transcript at all and it passed trivially. Capture now parses every record, so the
  // redaction boundary is the extractor's, and this is the test that holds it.
  mkdirSync(join(projects, '-work-repo'), { recursive: true });
  writeFileSync(
    join(projects, '-work-repo', 'sess-secret.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: '2026-08-07T15:00:00.000Z', message: { content: 'MY_API_KEY=super-secret-value' } }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-07T15:00:01.000Z',
        message: {
          id: 'msg_1',
          model: 'claude-opus-5',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'Write', input: { file_path: '/private/keys.env', content: 'TOKEN=leak-me' } }],
          usage: { input_tokens: 1, output_tokens: 2 },
        },
      }),
      JSON.stringify({
        type: 'user',
        timestamp: '2026-08-07T15:00:02.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] },
        toolUseResult: { filePath: '/private/keys.env', type: 'create', content: 'TOKEN=leak-me' },
      }),
    ].join('\n') + '\n',
  );

  const result = await capture({ raw: JSON.stringify({ session_id: 'sess-secret', cwd: '/work/repo' }), env: env() });

  // The transcript really was parsed — otherwise this test proves nothing.
  expect(result.record!.metrics!.turns.assistant).toBe(1);

  const stored = readFileSync(join(gemsHome, 'sessions.jsonl'), 'utf8');
  expect(stored).not.toContain('super-secret-value');
  expect(stored).not.toContain('MY_API_KEY');
  expect(stored).not.toContain('leak-me');
  expect(stored).not.toContain('TOKEN');
  expect(stored).not.toContain('keys.env');
});

test('capture attaches derived metrics to the record', async () => {
  mkdirSync(join(projects, '-work-repo'), { recursive: true });
  writeFileSync(
    join(projects, '-work-repo', 'sess-metrics.jsonl'),
    [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-07T15:00:00.000Z',
        message: {
          id: 'msg_1',
          model: 'claude-opus-5',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }],
          usage: { input_tokens: 3, output_tokens: 7, cache_read_input_tokens: 11, cache_creation_input_tokens: 2 },
        },
      }),
      JSON.stringify({
        type: 'user',
        timestamp: '2026-08-07T15:00:04.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: false }] },
        toolUseResult: { stdout: 'a', stderr: '', interrupted: false },
      }),
    ].join('\n') + '\n',
  );

  const result = await capture({ raw: JSON.stringify({ session_id: 'sess-metrics', cwd: '/work/repo' }), env: env() });

  expect(result.captured).toBe(true);
  expect(result.record!.schema).toBe(SCHEMA_VERSION);
  expect(result.record!.metrics).toMatchObject({
    models: { 'claude-opus-5': 1 },
    tokens: { input: 3, output: 7, cache_read: 11, cache_creation: 2 },
  });
  expect(result.record!.metrics!.tools.by_name).toEqual({ Bash: 1 });
  expect(result.record!.metrics!.duration_ms).toBe(4000);
  expect(result.record!.metrics!.invalid_actions.tool_failures).toBe(0);
});

test('an oversized transcript still yields a pointer record, with metrics left null', async () => {
  // Phase 1 skipped only the line count past the cap. Extraction is skipped for the same
  // reason: a record without metrics beats a hook killed mid-write by the 10s timeout.
  writeTranscript('-work-repo', 'sess-huge', 4);

  const result = await capture({
    raw: JSON.stringify({ session_id: 'sess-huge', cwd: '/work/repo' }),
    env: env(),
    maxLineCountBytes: 1,
  });

  expect(result.captured).toBe(true);
  expect(result.record!.metrics).toBeNull();
  expect(readFileSync(join(gemsHome, 'capture.log'), 'utf8')).toContain('over cap');
});

test('an unparsable transcript is still captured as a session that happened', async () => {
  mkdirSync(join(projects, '-work-repo'), { recursive: true });
  writeFileSync(join(projects, '-work-repo', 'sess-junk.jsonl'), 'not json\nalso not json\n');

  const result = await capture({ raw: JSON.stringify({ session_id: 'sess-junk', cwd: '/work/repo' }), env: env() });

  expect(result.captured).toBe(true);
  expect(result.record!.metrics!.unparsable_lines).toBe(2);
  expect(result.record!.metrics!.turns.assistant).toBe(0);
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
