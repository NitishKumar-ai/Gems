import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifyUserRecord,
  extractTranscript,
  failureSignals,
  METRICS_SCHEMA_VERSION,
  normalizeToolName,
} from './extract.mjs';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gems-extract-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function transcript(records: unknown[], name = 'session.jsonl') {
  const path = join(root, name);
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return path;
}

/** One assistant content block, as Claude Code records it: one line per block. */
function assistant(id: string, content: unknown[], usage?: Record<string, number>, extra: object = {}) {
  return {
    type: 'assistant',
    timestamp: '2026-08-07T15:00:00.000Z',
    message: {
      id,
      model: 'claude-opus-5',
      content,
      usage: usage ?? { input_tokens: 2, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 10 },
    },
    ...extra,
  };
}

function toolResult(toolUseId: string, toolUseResult: unknown, isError = false) {
  return {
    type: 'user',
    timestamp: '2026-08-07T15:00:01.000Z',
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] },
    toolUseResult,
  };
}

test('one message split across records is counted once, not once per block', async () => {
  // This is how a real turn is written: three lines, same message id, same usage object.
  // Summing per record inflated this repo's own session from 154,341 to 351,282 output tokens.
  const path = transcript([
    assistant('msg_1', [{ type: 'thinking', thinking: '...' }]),
    assistant('msg_1', [{ type: 'text', text: 'hello' }]),
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.turns.assistant).toBe(1);
  expect(m.models).toEqual({ 'claude-opus-5': 1 });
  expect(m.tokens.output).toBe(100);
  expect(m.tokens.cache_read).toBe(5000);
  // Tool calls still come from every record, because the blocks genuinely differ line to line.
  expect(m.tools.calls).toBe(1);
});

test('a synthetic turn is not attributed to a model', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'text', text: 'real' }]),
    {
      type: 'assistant',
      timestamp: '2026-08-07T15:00:02.000Z',
      message: { id: 'msg_2', model: '<synthetic>', content: [{ type: 'text', text: 'local' }], usage: {} },
    },
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.models).toEqual({ 'claude-opus-5': 1 });
  expect(m.turns.assistant).toBe(1);
  expect(m.turns.synthetic).toBe(1);
});

test('failures that never set is_error are still caught', async () => {
  // The exact shapes from this repo's own logs. A reader that only checks is_error scores
  // all four of these as a clean session.
  expect(failureSignals(toolResult('tu_1', 'Error: Exit code 1\nnot in repo'))).toContain('tool_result_error_text');
  expect(failureSignals({ type: 'assistant', isApiErrorMessage: true })).toContain('api_error_message');
  expect(failureSignals({ type: 'system', error: '{"message":"Connection error."}' })).toContain('record_error');
  expect(failureSignals({ type: 'system', retryAttempt: 1, maxRetries: 10 })).toContain('api_retry');
  expect(failureSignals(toolResult('tu_1', { stdout: 'ok' }, true))).toContain('tool_result_is_error');

  expect(failureSignals({ type: 'user' })).toEqual([]);
  expect(failureSignals(null)).toEqual([]);
});

test('a non-empty stderr on a successful command is not a failure', async () => {
  // Every non-empty stderr across this repo's two session logs is this benign notice from a
  // command that exited 0. Scoring it as a failure would invent failures that never happened.
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'cd /x && ls' } }]),
    toolResult('tu_1', { stdout: 'a\nb', stderr: '\nShell cwd was reset to /repo', interrupted: false }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.invalid_actions.tool_failures).toBe(0);
  expect(m.invalid_actions.rate).toBe(0);
});

test('a bad connection does not count against the invalid action rate', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
    toolResult('tu_1', { stdout: 'ok', stderr: '', interrupted: false }),
    { type: 'system', timestamp: '2026-08-07T15:00:03.000Z', error: '{"message":"Connection error."}', retryAttempt: 1 },
    { type: 'system', timestamp: '2026-08-07T15:00:04.000Z', error: '{"message":"Connection error."}', retryAttempt: 2 },
  ]);

  const m = (await extractTranscript(path))!;

  // The tool call succeeded. Someone's wifi is not their invalid action rate.
  expect(m.invalid_actions.tool_failures).toBe(0);
  expect(m.invalid_actions.rate).toBe(0);
  // But the trouble is still visible rather than silently dropped.
  expect(m.invalid_actions.api_errors).toBe(2);
  expect(m.invalid_actions.by_signal.api_retry).toBe(2);
});

test('a failed tool call does count against the invalid action rate', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
    assistant('msg_2', [{ type: 'tool_use', id: 'tu_2', name: 'Bash', input: { command: 'false' } }]),
    toolResult('tu_1', { stdout: 'ok', stderr: '', interrupted: false }),
    toolResult('tu_2', 'Error: Exit code 1', true),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.tools.calls).toBe(2);
  expect(m.invalid_actions.tool_failures).toBe(1);
  expect(m.invalid_actions.rate).toBe(0.5);
});

test('editing a file that was read first is informed; editing it blind is not', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: '/repo/a.ts' } }]),
    toolResult('tu_1', { file: { filePath: '/repo/a.ts', content: '...' } }),
    assistant('msg_2', [{ type: 'tool_use', id: 'tu_2', name: 'Edit', input: { file_path: '/repo/a.ts' } }]),
    toolResult('tu_2', { filePath: '/repo/a.ts', type: 'update' }),
    assistant('msg_3', [{ type: 'tool_use', id: 'tu_3', name: 'Edit', input: { file_path: '/repo/never-read.ts' } }]),
    toolResult('tu_3', { filePath: '/repo/never-read.ts', type: 'update' }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.evidence_before_edit.edits).toBe(2);
  expect(m.evidence_before_edit.informed).toBe(1);
  expect(m.evidence_before_edit.blind).toBe(1);
  expect(m.evidence_before_edit.rate).toBe(0.5);
});

test('creating a new file is not a blind edit', async () => {
  // You cannot read a file that does not exist. Counting a create as editing blind would
  // score every new file as recklessness.
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Write', input: { file_path: '/repo/new.ts' } }]),
    toolResult('tu_1', { filePath: '/repo/new.ts', type: 'create' }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.evidence_before_edit.creates).toBe(1);
  expect(m.evidence_before_edit.edits).toBe(0);
  expect(m.evidence_before_edit.blind).toBe(0);
  // No edits means no rate to report, rather than a fabricated 0% or 100%.
  expect(m.evidence_before_edit.rate).toBeNull();
});

test('overwriting an existing file with Write is an edit', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Write', input: { file_path: '/repo/old.ts' } }]),
    toolResult('tu_1', { filePath: '/repo/old.ts', type: 'update' }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.evidence_before_edit.edits).toBe(1);
  expect(m.evidence_before_edit.blind).toBe(1);
  expect(m.evidence_before_edit.creates).toBe(0);
});

test('a second edit to the same file is informed by the first', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: '/repo/a.ts' } }]),
    toolResult('tu_1', { file: { filePath: '/repo/a.ts' } }),
    assistant('msg_2', [{ type: 'tool_use', id: 'tu_2', name: 'Edit', input: { file_path: '/repo/a.ts' } }]),
    toolResult('tu_2', { filePath: '/repo/a.ts', type: 'update' }),
    assistant('msg_3', [{ type: 'tool_use', id: 'tu_3', name: 'Edit', input: { file_path: '/repo/a.ts' } }]),
    toolResult('tu_3', { filePath: '/repo/a.ts', type: 'update' }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.evidence_before_edit.edits).toBe(2);
  expect(m.evidence_before_edit.informed).toBe(2);
});

test('steering counts people, not the harness talking to itself', () => {
  expect(classifyUserRecord({ message: { content: 'fix the login bug' } })).toBe('prompt');
  expect(classifyUserRecord({ message: { content: '<command-message>ship</command-message>' } })).toBe('command');
  expect(classifyUserRecord({ isMeta: true, message: { content: 'Continue from where you left off.' } })).toBe('meta');
  expect(classifyUserRecord({ message: { content: '<task-notification>\n<task-id>x</task-id>' } })).toBe('injected');
  expect(classifyUserRecord({ message: { content: '<system-reminder>be good</system-reminder>' } })).toBe('injected');
  expect(classifyUserRecord({ message: { content: [{ type: 'tool_result', tool_use_id: 'x' }] } })).toBe('tool_result');
  expect(classifyUserRecord({ message: { content: '   ' } })).toBe('other');
  expect(classifyUserRecord({ message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } })).toBe(
    'interrupt',
  );
});

test('steering is reported as prompts, commands and interrupts separately', async () => {
  const path = transcript([
    { type: 'user', timestamp: '2026-08-07T15:00:00.000Z', message: { content: 'do the thing' } },
    assistant('msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
    assistant('msg_2', [{ type: 'text', text: 'done' }]),
    { type: 'user', timestamp: '2026-08-07T15:00:05.000Z', message: { content: '<command-message>ship</command-message>' } },
    { type: 'user', timestamp: '2026-08-07T15:00:06.000Z', isMeta: true, message: { content: 'Continue.' } },
    toolResult('tu_1', { stdout: '', stderr: '', interrupted: true }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.steering.prompts).toBe(1);
  expect(m.steering.commands).toBe(1);
  expect(m.steering.interrupts).toBe(1);
  expect(m.steering.turns_per_prompt).toBe(1);
});

test('the metrics carry no prompt text, file content, or file path', async () => {
  const path = transcript([
    { type: 'user', timestamp: '2026-08-07T15:00:00.000Z', message: { content: 'my password is hunter2' } },
    assistant('msg_1', [
      { type: 'tool_use', id: 'tu_1', name: 'Write', input: { file_path: '/repo/secrets.env', content: 'API_KEY=leak-me' } },
    ]),
    toolResult('tu_1', { filePath: '/repo/secrets.env', type: 'create', content: 'API_KEY=leak-me' }),
  ]);

  const serialized = JSON.stringify(await extractTranscript(path));

  expect(serialized).not.toContain('hunter2');
  expect(serialized).not.toContain('leak-me');
  expect(serialized).not.toContain('API_KEY');
  expect(serialized).not.toContain('secrets.env');
  expect(serialized).not.toContain('/repo');
});

test('an MCP connector id is stripped from a tool name, a readable server name is kept', () => {
  // Real names seen running this extractor over this machine's own sessions.
  expect(normalizeToolName('mcp__93e19283-bb1c-425b-be2d-32f39f61705c__notion-create-pages')).toBe(
    'mcp__<connector>__notion-create-pages',
  );
  // Which tools someone reaches for is the signal; which account they reached with is not.
  expect(normalizeToolName('mcp__gbrain__search')).toBe('mcp__gbrain__search');
  expect(normalizeToolName('mcp__claude-in-chrome__navigate')).toBe('mcp__claude-in-chrome__navigate');
  expect(normalizeToolName('Bash')).toBe('Bash');
  expect(normalizeToolName('mcp__weird')).toBe('mcp__weird');
});

test('a connector id never reaches the metrics', async () => {
  const path = transcript([
    assistant('msg_1', [
      { type: 'tool_use', id: 'tu_1', name: 'mcp__93e19283-bb1c-425b-be2d-32f39f61705c__notion-fetch', input: {} },
    ]),
  ]);

  const m = (await extractTranscript(path))!;

  expect(JSON.stringify(m)).not.toContain('93e19283');
  expect(m.tools.by_name).toEqual({ 'mcp__<connector>__notion-fetch': 1 });
});

test('a partial trailing line does not lose the session', async () => {
  const path = join(root, 'partial.jsonl');
  writeFileSync(
    path,
    `${JSON.stringify(assistant('msg_1', [{ type: 'text', text: 'ok' }]))}\n{"type":"assistant","message":{"id":"msg_2"`,
  );

  const m = (await extractTranscript(path))!;

  expect(m.turns.assistant).toBe(1);
  expect(m.unparsable_lines).toBe(1);
});

test('an empty transcript summarizes to zeroes rather than null ratios of nothing', async () => {
  const path = join(root, 'empty.jsonl');
  writeFileSync(path, '');

  const m = (await extractTranscript(path))!;

  expect(m.schema).toBe(METRICS_SCHEMA_VERSION);
  expect(m.turns.assistant).toBe(0);
  expect(m.tools.calls).toBe(0);
  expect(m.duration_ms).toBeNull();
  expect(m.evidence_before_edit.rate).toBeNull();
  expect(m.invalid_actions.rate).toBeNull();
  expect(m.started_at).toBeNull();
});

test('extractTranscript resolves null for a path that cannot be read', async () => {
  expect(await extractTranscript(join(root, 'nope.jsonl'))).toBeNull();
});

test('duration spans the first and last timestamp regardless of record order', async () => {
  const path = transcript([
    { type: 'user', timestamp: '2026-08-07T16:00:00.000Z', message: { content: 'later' } },
    { type: 'user', timestamp: '2026-08-07T15:00:00.000Z', message: { content: 'earlier' } },
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.started_at).toBe('2026-08-07T15:00:00.000Z');
  expect(m.ended_at).toBe('2026-08-07T16:00:00.000Z');
  expect(m.duration_ms).toBe(3600000);
});

test('sidechain records are counted so parallel agent work is visible', async () => {
  const path = transcript([
    assistant('msg_1', [{ type: 'text', text: 'main' }]),
    assistant('msg_2', [{ type: 'text', text: 'agent' }], undefined, { isSidechain: true }),
  ]);

  const m = (await extractTranscript(path))!;

  expect(m.sidechain_records).toBe(1);
});
