import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  aggregate,
  buildJourney,
  compareWindows,
  JOURNEY_SCHEMA_VERSION,
  latestPerSession,
  MIN_SESSIONS_FOR_TREND,
  parseStore,
  readStore,
  sortSessions,
  trailingWindow,
} from './journey.mjs';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gems-journey-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A store row: the Phase 1 pointer with the Phase 2 metrics attached. */
function session(
  id: string,
  startedAt: string,
  metrics: Partial<{
    edits: number;
    informed: number;
    calls: number;
    failures: number;
    turns: number;
    prompts: number;
    interrupts: number;
    model: string;
  }> = {},
) {
  const {
    edits = 0,
    informed = 0,
    calls = 0,
    failures = 0,
    turns = 0,
    prompts = 0,
    interrupts = 0,
    model = 'claude-opus-5',
  } = metrics;

  return {
    schema: 2,
    session_id: id,
    captured_at: startedAt,
    bytes: 1000,
    metrics: {
      schema: 1,
      started_at: startedAt,
      ended_at: startedAt,
      duration_ms: 1000,
      models: { [model]: turns },
      turns: { assistant: turns, synthetic: 0, prompts, commands: 0, records: turns },
      tokens: { input: 1, output: 10, cache_read: 100, cache_creation: 5 },
      tools: { calls, results: calls, by_name: { Bash: calls } },
      evidence_before_edit: {
        edits,
        informed,
        blind: edits - informed,
        creates: 0,
        verify_calls: calls,
        rate: edits ? informed / edits : null,
      },
      steering: { prompts, commands: 0, interrupts, turns_per_prompt: prompts ? turns / prompts : null },
      invalid_actions: {
        tool_calls: calls,
        tool_failures: failures,
        rate: calls ? failures / calls : null,
        api_errors: 0,
        by_signal: failures ? { tool_result_is_error: failures } : {},
      },
      sidechain_records: 0,
      unparsable_lines: 0,
    },
  };
}

test('a resumed session is counted once, from its final record', () => {
  // Phase 1 appends a second, larger record when a session is resumed. The earlier record
  // is a prefix of the later one, so summing both would double-count the same work.
  const records = [
    session('a', '2026-08-01T00:00:00.000Z', { edits: 2, informed: 1, calls: 10 }),
    session('a', '2026-08-01T00:00:00.000Z', { edits: 5, informed: 4, calls: 25 }),
    session('b', '2026-08-02T00:00:00.000Z', { edits: 1, informed: 1, calls: 5 }),
  ];

  const latest = latestPerSession(records);

  expect(latest).toHaveLength(2);
  expect(aggregate(latest).edits).toBe(6);
  expect(aggregate(latest).tool_calls).toBe(30);
});

test('rates are pooled, never averaged across sessions', () => {
  // A one-edit session that went badly and a hundred-edit session that went well are not
  // equal evidence. Mean-of-ratios reports (0 + 1) / 2 = 50%; the truth is 100/101 = 99%.
  const sessions = [
    session('small', '2026-08-01T00:00:00.000Z', { edits: 1, informed: 0 }),
    session('large', '2026-08-02T00:00:00.000Z', { edits: 100, informed: 100 }),
  ];

  const totals = aggregate(sessions);

  expect(totals.edits).toBe(101);
  expect(totals.informed_edits).toBe(100);
  expect(totals.rates.evidence_before_edit).toBe(0.9901);
});

test('steering_rate_event is pooled across sessions, like every other rate', () => {
  const sessions = [
    session('a', '2026-08-01T00:00:00.000Z', { prompts: 10, interrupts: 1 }),
    session('b', '2026-08-02T00:00:00.000Z', { prompts: 10, interrupts: 3 }),
  ];

  expect(aggregate(sessions).rates.steering_rate_event).toBe(0.2); // 4/20, not (0.1+0.3)/2
});

test('a session with zero prompts cannot move steering_rate_event', () => {
  // No prompts means no possible interrupt — pooling a (0, 0) contribution is a no-op,
  // which is what "a session only counts if prompts > 0" resolves to in practice.
  const sessions = [
    session('thin', '2026-08-01T00:00:00.000Z', { prompts: 0, interrupts: 0 }),
    session('real', '2026-08-02T00:00:00.000Z', { prompts: 5, interrupts: 1 }),
  ];

  expect(aggregate(sessions).rates.steering_rate_event).toBe(0.2);
});

test('sessions with no metrics are counted as thin history, not as zeroes', () => {
  // A Phase 1 record has no metrics. Treating it as a session with zero edits would drag
  // every rate toward a number nobody earned.
  const sessions = [
    { session_id: 'phase1', captured_at: '2026-08-01T00:00:00.000Z', bytes: 10 },
    session('phase2', '2026-08-02T00:00:00.000Z', { edits: 4, informed: 4, calls: 8 }),
  ];

  const totals = aggregate(sessions);

  expect(totals.sessions).toBe(1);
  expect(totals.unextracted).toBe(1);
  expect(totals.rates.evidence_before_edit).toBe(1);
});

test('no trend is reported from too little history', () => {
  const sessions = Array.from({ length: MIN_SESSIONS_FOR_TREND - 1 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 2, informed: 1, calls: 4 }),
  );

  const journey = buildJourney(sessions);

  expect(journey.trend).toBeNull();
  expect(journey.trend_unavailable_reason).toContain(`have ${MIN_SESSIONS_FOR_TREND - 1}`);
});

test('a habit that improved shows a positive Evidence-Before-Edit delta', () => {
  // Three early sessions editing blind, three recent ones reading first.
  const early = [0, 1, 2].map((i) =>
    session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, { edits: 10, informed: 2, calls: 20, failures: 4 }),
  );
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 10, informed: 9, calls: 20, failures: 1 }),
  );

  const journey = buildJourney([...recent, ...early]); // order in the store must not matter

  expect(journey.trend).not.toBeNull();
  expect(journey.trend!.earlier.evidence_before_edit).toBe(0.2);
  expect(journey.trend!.recent.evidence_before_edit).toBe(0.9);
  expect(journey.trend!.delta.evidence_before_edit).toBe(0.7);

  // The sign follows the metric, not a notion of "good": fewer failures is a negative delta.
  expect(journey.trend!.delta.invalid_action).toBe(-0.15);
});

test('Prompt Craft trend: falling steering rate produces a negative delta', () => {
  // Distinct from the hands-on badge (session-level, permanent floor): this is the trend
  // of the event-level ratio, recent minus earlier, same sign convention as every other
  // delta — falling steering is a negative delta, not "improvement" encoded as positive.
  const early = [0, 1, 2].map((i) =>
    session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, { prompts: 10, interrupts: 4 }),
  );
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { prompts: 10, interrupts: 1 }),
  );

  const journey = buildJourney([...recent, ...early]);

  expect(journey.trend!.earlier.steering_rate_event).toBe(0.4);
  expect(journey.trend!.recent.steering_rate_event).toBe(0.1);
  expect(journey.trend!.delta.steering_rate_event).toBe(-0.3);
});

test('a delta is null when one window has nothing to measure', () => {
  const early = [0, 1, 2].map((i) => session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, { calls: 5 }));
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 4, informed: 4, calls: 5 }),
  );

  const journey = buildJourney([...early, ...recent]);

  // No edits in the earlier window, so there is no habit to have moved from.
  expect(journey.trend!.earlier.evidence_before_edit).toBeNull();
  expect(journey.trend!.delta.evidence_before_edit).toBeNull();
});

test('sessions sort by when the work happened, not when it was captured', () => {
  const sorted = sortSessions([
    session('b', '2026-08-05T00:00:00.000Z'),
    session('a', '2026-08-01T00:00:00.000Z'),
    session('c', '2026-08-09T00:00:00.000Z'),
  ]);

  expect(sorted.map((s) => s.session_id)).toEqual(['a', 'b', 'c']);
});

test('models and tools are pooled across the whole store', () => {
  const totals = aggregate([
    session('a', '2026-08-01T00:00:00.000Z', { turns: 10, calls: 3, model: 'claude-opus-5' }),
    session('b', '2026-08-02T00:00:00.000Z', { turns: 4, calls: 7, model: 'claude-sonnet-5' }),
    session('c', '2026-08-03T00:00:00.000Z', { turns: 6, calls: 1, model: 'claude-opus-5' }),
  ]);

  expect(totals.models).toEqual({ 'claude-opus-5': 16, 'claude-sonnet-5': 4 });
  expect(totals.tools).toEqual({ Bash: 11 });
  // Most-used first, so a profile can render the top of the object without re-sorting.
  expect(Object.keys(totals.models)[0]).toBe('claude-opus-5');
});

test('a corrupt line does not lose the rest of the store', () => {
  const good = JSON.stringify(session('a', '2026-08-01T00:00:00.000Z', { edits: 1, informed: 1 }));
  const { records, corrupt } = parseStore(`${good}\nthis is not json\n${good.replace('"a"', '"b"')}\n`);

  expect(records).toHaveLength(2);
  expect(corrupt).toBe(1);
});

test('readStore returns an empty store rather than throwing on a missing file', () => {
  expect(readStore(join(root, 'nope.jsonl'))).toEqual({ records: [], corrupt: 0 });
});

test('readStore parses a store written to disk', () => {
  const path = join(root, 'sessions.jsonl');
  writeFileSync(path, `${JSON.stringify(session('a', '2026-08-01T00:00:00.000Z', { edits: 3, informed: 3 }))}\n`);

  const { records } = readStore(path);
  const journey = buildJourney(records);

  expect(journey.schema).toBe(JOURNEY_SCHEMA_VERSION);
  expect(journey.totals.sessions).toBe(1);
  expect(journey.first_session_at).toBe('2026-08-01T00:00:00.000Z');
});

test('an empty store produces a journey with nothing claimed', () => {
  const journey = buildJourney([]);

  expect(journey.totals.sessions).toBe(0);
  expect(journey.totals.rates.evidence_before_edit).toBeNull();
  expect(journey.trend).toBeNull();
  expect(journey.first_session_at).toBeNull();
  expect(journey.achievements.earned).toEqual([]);
});

test('a journey carries achievements derived from the same sessions as its totals', () => {
  const sessions = Array.from({ length: 3 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 20, informed: 20, calls: 40, turns: 8 }),
  );

  const journey = buildJourney(sessions);
  const earned = journey.achievements.earned.map((a: { id: string }) => a.id);

  expect(journey.achievements.qualifying_sessions).toBe(journey.totals.sessions);
  expect(earned).toContain('reads-first');
  expect(earned).toContain('first-light');
});

// The gate belongs to achievements alone. Totals still describe everything captured, so a
// thin session is absent from the badges without going missing from the record.
test('sessions too thin for achievements still count toward totals', () => {
  const journey = buildJourney([
    session('real', '2026-08-01T00:00:00.000Z', { calls: 40, turns: 10 }),
    session('empty', '2026-08-02T00:00:00.000Z', { calls: 0, turns: 0 }),
  ]);

  expect(journey.totals.sessions).toBe(2);
  expect(journey.achievements.qualifying_sessions).toBe(1);
  expect(journey.achievements.ignored_sessions).toBe(1);
});

test('window summaries carry the counts behind their rates', () => {
  const early = Array.from({ length: 3 }, (_, i) =>
    session(`e${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 10, informed: 5 }),
  );
  const recent = Array.from({ length: 3 }, (_, i) =>
    session(`r${i}`, `2026-09-0${i + 1}T00:00:00.000Z`, { edits: 10, informed: 9 }),
  );

  const journey = buildJourney([...early, ...recent]);
  if (!journey.trend) throw new Error('expected a trend from six sessions');

  expect(journey.trend.earlier.edits).toBe(30);
  expect(journey.trend.recent.edits).toBe(30);
});

test('trailingWindow is locked (null) until it has a full n sessions', () => {
  const sessions = Array.from({ length: 9 }, (_, i) =>
    session(`s${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { calls: 10, failures: 1 }),
  );

  expect(trailingWindow(sessions, 10)).toBeNull();
});

test('trailingWindow computes a rate once the window is full', () => {
  const sessions = Array.from({ length: 10 }, (_, i) =>
    session(`s${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { calls: 10, failures: 1 }),
  );

  const window = trailingWindow(sessions, 10);

  expect(window).not.toBeNull();
  expect(window!.sessions).toBe(10);
  expect(window!.invalid_action).toBe(0.1);
});

test('trailingWindow slides — an old session drops out as a new one lands', () => {
  // Ten clean sessions, then one bad one lands. A permanent floor (like compareWindows'
  // half-split) would dilute the bad session across all history; a live trailing window
  // should reflect it fully once it pushes the oldest clean session out.
  const clean = Array.from({ length: 10 }, (_, i) =>
    session(`clean${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { calls: 10, failures: 0 }),
  );
  const bad = session('bad', '2026-08-11T00:00:00.000Z', { calls: 10, failures: 10 });

  const window = trailingWindow([...clean, bad], 10);

  // Drops clean0, keeps clean1..clean9 + bad: 10 failures across 100 calls.
  expect(window!.invalid_action).toBe(0.1);
});

test('trailingWindow raw counts match a compareWindows recent-window aggregate over the same slice', () => {
  const sessions = Array.from({ length: 10 }, (_, i) =>
    session(`s${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { edits: 5, informed: 5, calls: 4 }),
  );

  const window = trailingWindow(sessions, 10);
  const compared = compareWindows([], sessions);

  expect(window!.edits).toBe(compared.recent.edits);
  expect(window!.tool_calls).toBe(compared.recent.tool_calls);
});
