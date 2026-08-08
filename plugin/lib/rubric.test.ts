import { expect, test } from 'bun:test';

import { QUALIFYING_ASSISTANT_TURNS, QUALIFYING_TOOL_CALLS } from './achievements.mjs';
import { buildJourney } from './journey.mjs';
import {
  EVIDENCE_DISCIPLINE_EDIT_FLOOR,
  EXECUTION_HYGIENE_TRAILING_SESSIONS,
  evaluateRubric,
  RUBRIC_SIGNAL_SCHEMA_VERSION,
} from './rubric.mjs';
import {
  EVIDENCE_DISCIPLINE_BANDS,
  EXECUTION_HYGIENE_BANDS,
  PROMPT_CRAFT_BANDS,
  interpolateBand
} from '../../shared/rubric-bands.mjs';

/** A qualifying session by default (clears achievements.mjs's tool_calls/turns floor). */
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
  }> = {},
) {
  const {
    edits = 0,
    informed = 0,
    calls = QUALIFYING_TOOL_CALLS,
    failures = 0,
    turns = QUALIFYING_ASSISTANT_TURNS,
    prompts = 0,
    interrupts = 0,
  } = metrics;

  return {
    schema: 2,
    session_id: id,
    captured_at: startedAt,
    metrics: {
      schema: 1,
      started_at: startedAt,
      ended_at: startedAt,
      duration_ms: 1000,
      models: { 'claude-opus-5': turns },
      turns: { assistant: turns, synthetic: 0, prompts, commands: 0, records: turns },
      tokens: { input: 1, output: 10, cache_read: 100, cache_creation: 5 },
      tools: { calls, results: calls, by_name: { Bash: calls } },
      evidence_before_edit: { edits, informed, blind: edits - informed, creates: 0, verify_calls: calls },
      steering: { prompts, commands: 0, interrupts },
      invalid_actions: { tool_calls: calls, tool_failures: failures, api_errors: 0, by_signal: {} },
    },
  };
}

/** A session too thin to qualify — opened and closed, no real work. */
function thinSession(id: string, startedAt: string) {
  return session(id, startedAt, { calls: 1, turns: 0 });
}

type DimensionResult = {
  locked: boolean;
  progress?: { value: number; target: number; label: string; ratio: number };
  value?: number;
  evidence?: string;
  direction?: string;
  directions?: Record<string, string | null>;
};

function dim(result: ReturnType<typeof evaluateRubric>, id: string): DimensionResult {
  return (result.dimensions as unknown as Record<string, DimensionResult>)[id];
}

test('interpolateBand clamps outside the range and hits anchors exactly on a boundary', () => {
  const anchors: [number, number][] = [
    [0, 1],
    [0.2, 2],
    [0.5, 6],
  ];

  expect(interpolateBand(-1, anchors)).toBe(1); // below range, clamps to first
  expect(interpolateBand(0.2, anchors)).toBe(2); // exactly on a boundary — belongs to it
  expect(interpolateBand(10, anchors)).toBe(6); // above range, clamps to last
});

test('interpolateBand interpolates linearly between two anchors, not a discrete jump', () => {
  const anchors: [number, number][] = [
    [0, 0],
    [1, 10],
  ];

  expect(interpolateBand(0.5, anchors)).toBe(5);
  expect(interpolateBand(0.25, anchors)).toBe(2.5);
});

test('interpolateBand works with descending scores (Execution Hygiene: lower rate is better)', () => {
  expect(interpolateBand(0, EXECUTION_HYGIENE_BANDS)).toBe(10);
  expect(interpolateBand(1, EXECUTION_HYGIENE_BANDS)).toBe(2); // clamps to the worst tier
});

test('a session too thin to qualify contributes to nothing', () => {
  const sessions = [
    thinSession('thin', '2026-08-01T00:00:00.000Z'),
    ...Array.from({ length: 49 }, (_, i) =>
      session(`s${i}`, `2026-08-0${(i % 9) + 2}T00:00:00.000Z`, { edits: 1, informed: 1 }),
    ),
  ];

  const result = evaluateRubric(sessions);

  expect(result.qualifying_sessions).toBe(49);
});

test('Evidence Discipline is locked below the edit floor, with progress toward it', () => {
  const sessions = [session('a', '2026-08-01T00:00:00.000Z', { edits: 10, informed: 9 })];

  const ed = dim(evaluateRubric(sessions), 'evidence-discipline');

  expect(ed.locked).toBe(true);
  expect(ed.progress).toEqual({ value: 10, target: EVIDENCE_DISCIPLINE_EDIT_FLOOR, label: 'edits recorded', ratio: 0.2 });
});

test('Evidence Discipline exposes the raw rate, not a pre-interpolated score', () => {
  // The raw rate is what gets published, frozen forever. The 0-10 score is a render-time
  // step (interpolateBand, via src/lib/rubric.ts) so a later band recalibration can change
  // what displays without anyone republishing — baking a score in here would defeat that.
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 20, informed: 16 }), // 100 edits, 80% informed
  );

  const ed = dim(evaluateRubric(sessions), 'evidence-discipline');

  expect(ed.locked).toBe(false);
  expect(ed.value).toBe(0.8);
  expect(interpolateBand(ed.value!, EVIDENCE_DISCIPLINE_BANDS)).toBe(10);
  expect(ed.evidence).toBe('80/100 edits informed (80.0%)');
});

test('Prompt Craft is locked until MIN_SESSIONS_FOR_TREND qualifying sessions exist', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { prompts: 10, interrupts: 2 }),
  );

  const pc = dim(evaluateRubric(sessions), 'prompt-craft');

  expect(pc.locked).toBe(true);
});

test('Prompt Craft scores the delta of steering_rate_event, not the raw rate', () => {
  const early = [0, 1, 2].map((i) =>
    session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, { prompts: 10, interrupts: 4 }),
  );
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { prompts: 10, interrupts: 1 }),
  );

  const pc = dim(evaluateRubric([...recent, ...early]), 'prompt-craft');

  expect(pc.locked).toBe(false);
  // earlier 0.4, recent 0.1 — the raw delta is -0.3, a falling steering rate.
  expect(pc.value).toBe(-0.3);
  expect(interpolateBand(pc.value!, PROMPT_CRAFT_BANDS)).toBeGreaterThan(5);
});

test('Execution Hygiene is locked below the trailing-window floor', () => {
  const sessions = Array.from({ length: EXECUTION_HYGIENE_TRAILING_SESSIONS - 1 }, (_, i) =>
    session(`s${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { calls: 10, failures: 1 }),
  );

  const hygiene = dim(evaluateRubric(sessions), 'execution-hygiene');

  expect(hygiene.locked).toBe(true);
});

test('Execution Hygiene reflects only the trailing window, not full history', () => {
  // Ten clean sessions, then one bad one lands — a live window should feel it fully once
  // the oldest clean session drops out, unlike a permanent floor that would dilute it.
  const clean = Array.from({ length: EXECUTION_HYGIENE_TRAILING_SESSIONS }, (_, i) =>
    session(`clean${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, { calls: 10, failures: 0 }),
  );
  const bad = session('bad', '2026-08-11T00:00:00.000Z', { calls: 10, failures: 10 });

  const hygiene = dim(evaluateRubric([...clean, bad]), 'execution-hygiene');

  expect(hygiene.locked).toBe(false);
  expect(hygiene.value).toBe(0.1); // 10 failures / 100 calls — the raw rate, not a score
});

test('Learning Velocity is locked until the other three have a computable trend', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 5, informed: 4 }),
  );

  const lv = dim(evaluateRubric(sessions), 'learning-velocity');

  expect(lv.locked).toBe(true);
});

test('Learning Velocity reports the majority direction across the other three dimensions', () => {
  // Evidence-before-edit up, invalid-action rate flat (within tolerance), steering down —
  // two of three improved, one flat: majority is "improved".
  const early = [0, 1, 2].map((i) =>
    session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, {
      edits: 10,
      informed: 2,
      calls: 20,
      failures: 2,
      prompts: 10,
      interrupts: 4,
    }),
  );
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, {
      edits: 10,
      informed: 9,
      calls: 20,
      failures: 2,
      prompts: 10,
      interrupts: 1,
    }),
  );

  const lv = dim(evaluateRubric([...recent, ...early]), 'learning-velocity');

  expect(lv.locked).toBe(false);
  expect(lv.directions!.evidence_before_edit).toBe('improved');
  expect(lv.directions!.invalid_action).toBe('flat');
  expect(lv.directions!.steering_rate_event).toBe('improved');
  expect(lv.direction).toBe('improved');
});

test('Learning Velocity reports "mixed" when there is no 2-of-3 agreement', () => {
  // Evidence-before-edit improves, invalid-action rate worsens, steering flat — one of each.
  const early = [0, 1, 2].map((i) =>
    session(`early${i}`, `2026-06-0${i + 1}T00:00:00.000Z`, {
      edits: 10,
      informed: 2,
      calls: 20,
      failures: 0,
      prompts: 10,
      interrupts: 2,
    }),
  );
  const recent = [0, 1, 2].map((i) =>
    session(`recent${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, {
      edits: 10,
      informed: 9,
      calls: 20,
      failures: 6,
      prompts: 10,
      interrupts: 2,
    }),
  );

  const lv = dim(evaluateRubric([...recent, ...early]), 'learning-velocity');

  expect(lv.directions!.evidence_before_edit).toBe('improved');
  expect(lv.directions!.invalid_action).toBe('declined');
  expect(lv.directions!.steering_rate_event).toBe('flat');
  expect(lv.direction).toBe('mixed');
});

test('evaluateRubric carries its own raw-signal schema version', () => {
  // Deliberately does NOT carry band_version/provisional — those describe how to interpret
  // a signal, not the signal itself, and belong in src/lib/rubric.ts as live constants.
  const result = evaluateRubric([]);

  expect(result.schema).toBe(RUBRIC_SIGNAL_SCHEMA_VERSION);
  expect(result).not.toHaveProperty('band_version');
  expect(result).not.toHaveProperty('provisional');
});

test('buildJourney wires rubric alongside achievements, from the same session list', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session(`s${i}`, `2026-08-0${i + 1}T00:00:00.000Z`, { edits: 20, informed: 20 }),
  );

  const journey = buildJourney(sessions);

  expect(journey.rubric.qualifying_sessions).toBe(journey.achievements.qualifying_sessions);
});
