import { expect, test } from 'bun:test';

import {
  ACHIEVEMENTS_SCHEMA_VERSION,
  evaluateAchievements,
  QUALIFYING_ASSISTANT_TURNS,
  QUALIFYING_TOOL_CALLS,
  qualifies,
} from './achievements.mjs';

/** A store row shaped like the one `capture-session` writes, with only the fields rules read. */
function session(
  startedAt: string,
  metrics: Partial<{
    calls: number;
    failures: number;
    turns: number;
    edits: number;
    informed: number;
    interrupts: number;
    models: Record<string, number>;
    tools: Record<string, number>;
  }> = {},
) {
  const {
    calls = 10,
    failures = 0,
    turns = 5,
    edits = 0,
    informed = 0,
    interrupts = 0,
    models = { 'claude-opus-5': 5 },
    tools = { Read: calls },
  } = metrics;

  return {
    schema: 2,
    session_id: `s-${startedAt}-${calls}-${edits}`,
    captured_at: startedAt,
    metrics: {
      schema: 1,
      started_at: startedAt,
      ended_at: startedAt,
      models,
      turns: { assistant: turns },
      tools: { calls, by_name: tools },
      evidence_before_edit: { edits, informed },
      steering: { interrupts },
      invalid_actions: { tool_calls: calls, tool_failures: failures },
    },
  };
}

function ids(result: ReturnType<typeof evaluateAchievements>) {
  return result.earned.map((a) => a.id);
}

type Badge = ReturnType<typeof evaluateAchievements>['earned'][number];

/** Throws with the list it did search, so a missing badge fails as itself rather than as
 *  an assertion against `undefined`. */
function badge(list: Badge[], id: string): Badge {
  const found = list.find((a) => a.id === id);
  if (!found) throw new Error(`no achievement "${id}" in: ${list.map((a) => a.id).join(', ') || '(none)'}`);
  return found;
}

function progressOf(list: Badge[], id: string) {
  const found = badge(list, id);
  if (!found.progress) throw new Error(`achievement "${id}" carries no progress`);
  return found.progress;
}

function day(n: number) {
  return `2026-03-${String(n).padStart(2, '0')}T12:00:00.000Z`;
}

test('reports its schema version', () => {
  expect(evaluateAchievements([]).schema).toBe(ACHIEVEMENTS_SCHEMA_VERSION);
});

test('an empty store earns nothing and locks everything', () => {
  const result = evaluateAchievements([]);
  expect(result.earned).toEqual([]);
  expect(result.locked.length).toBeGreaterThan(0);
  expect(result.qualifying_sessions).toBe(0);
});

// The load-bearing anti-farm test. Opening and closing Claude Code in a loop produces
// sessions with no tool calls, and a naive rule reads their failure rate as a perfect zero.
test('sessions below the work threshold never count toward anything', () => {
  const empties = Array.from({ length: 40 }, (_, i) => session(day(i + 1), { calls: 0, turns: 0 }));
  const result = evaluateAchievements(empties);

  expect(result.qualifying_sessions).toBe(0);
  expect(result.ignored_sessions).toBe(40);
  expect(ids(result)).toEqual([]);
});

test('the qualifying gate is exactly at the documented thresholds', () => {
  expect(qualifies(session(day(1), { calls: QUALIFYING_TOOL_CALLS, turns: QUALIFYING_ASSISTANT_TURNS }))).toBe(true);
  expect(qualifies(session(day(1), { calls: QUALIFYING_TOOL_CALLS - 1, turns: QUALIFYING_ASSISTANT_TURNS }))).toBe(false);
  expect(qualifies(session(day(1), { calls: QUALIFYING_TOOL_CALLS, turns: QUALIFYING_ASSISTANT_TURNS - 1 }))).toBe(false);
});

test('a Phase 1 record with no metrics is ignored rather than counted', () => {
  const result = evaluateAchievements([{ schema: 1, session_id: 'a', captured_at: day(1) }]);
  expect(result.qualifying_sessions).toBe(0);
  expect(result.ignored_sessions).toBe(1);
});

test('first-light lands on the first real session and cites it', () => {
  const result = evaluateAchievements([session(day(1), { calls: 9, turns: 4 })]);
  const first = badge(result.earned, 'first-light');

  expect(first.earned_at).toBe(day(1));
  expect(first.earned_at_session).toBe(1);
  expect(first.evidence).toBe('9 tool calls across 4 assistant turns');
});

// Session ids are Claude Code UUIDs and this artifact is built to be published.
test('no achievement carries a session id off the machine', () => {
  const result = evaluateAchievements([session(day(1)), session(day(2))]);
  const serialized = JSON.stringify(result);

  expect(serialized).not.toContain('session_id');
  expect(serialized).not.toContain('s-2026-03-01');
});

test('reads-first needs the rate and the volume together', () => {
  // 100% informed, but only two edits. A perfect ratio over nothing is not evidence.
  const thin = evaluateAchievements([session(day(1), { edits: 2, informed: 2 })]);
  expect(ids(thin)).not.toContain('reads-first');

  // 60 edits, but only 60% informed.
  const sloppy = evaluateAchievements([session(day(1), { edits: 60, informed: 36 })]);
  expect(ids(sloppy)).not.toContain('reads-first');

  const both = evaluateAchievements([session(day(1), { edits: 60, informed: 57 })]);
  const earned = badge(both.earned, 'reads-first');
  expect(earned.evidence).toBe('informed 57 of 60 edits (95.0%)');
});

test('clean-hands needs 200 calls before a clean record means anything', () => {
  const thin = evaluateAchievements([session(day(1), { calls: 50, failures: 0 })]);
  expect(ids(thin)).not.toContain('clean-hands');

  // Fires on the first prefix that clears the floor — four sessions, not five.
  const enough = evaluateAchievements(
    Array.from({ length: 5 }, (_, i) => session(day(i + 1), { calls: 50, failures: 1 })),
  );
  const earned = badge(enough.earned, 'clean-hands');
  expect(earned.evidence).toBe('4 failures in 200 calls (2.0%)');
  expect(earned.earned_at_session).toBe(4);
});

test('clean-hands stays locked when the failure rate is over the line', () => {
  const noisy = evaluateAchievements(
    Array.from({ length: 5 }, (_, i) => session(day(i + 1), { calls: 50, failures: 3 })),
  );
  expect(ids(noisy)).not.toContain('clean-hands');
});

test('rates are pooled, never averaged per session', () => {
  // One blind edit beside ninety-nine informed ones is 99%, not the 50% a mean of the two
  // session rates would report — and 50% would keep this badge locked.
  const result = evaluateAchievements([
    session(day(1), { edits: 1, informed: 0 }),
    session(day(2), { edits: 99, informed: 99 }),
  ]);

  expect(ids(result)).toContain('reads-first');
});

test('consistency is counted in distinct days, so one busy afternoon is not a fortnight', () => {
  const oneDay = Array.from({ length: 20 }, (_, i) =>
    session(`2026-03-01T${String(i).padStart(2, '0')}:00:00.000Z`),
  );
  expect(ids(evaluateAchievements(oneDay))).not.toContain('fortnight');

  const twoWeeks = Array.from({ length: 14 }, (_, i) => session(day(i + 1)));
  const earned = badge(evaluateAchievements(twoWeeks).earned, 'fortnight');
  expect(earned.evidence).toBe('14 distinct days');
  expect(earned.earned_at_session).toBe(14);
});

test('days bucket in UTC so a timezone change cannot invent a streak', () => {
  // Same UTC day, expressed either side of midnight in local terms.
  const result = evaluateAchievements([
    session('2026-03-01T23:30:00.000Z'),
    session('2026-03-01T00:30:00.000Z'),
  ]);
  expect(progressOf(result.locked, 'fortnight').value).toBe(1);
});

test('long-haul counts ISO weeks across a year boundary without collapsing them', () => {
  const weekly = [
    '2025-11-20', '2025-11-27', '2025-12-04', '2025-12-11',
    '2025-12-18', '2025-12-25', '2026-01-01', '2026-01-08',
  ].map((d) => session(`${d}T12:00:00.000Z`));

  const earned = badge(evaluateAchievements(weekly).earned, 'long-haul');
  expect(earned.evidence).toBe('8 distinct weeks');
});

test('flawless-run reads one session, not the pooled total', () => {
  // 200 clean calls, but spread across four sessions of 50.
  const spread = Array.from({ length: 4 }, (_, i) => session(day(i + 1), { calls: 50 }));
  expect(ids(evaluateAchievements(spread))).toContain('flawless-run');

  const short = Array.from({ length: 10 }, (_, i) => session(day(i + 1), { calls: 20 }));
  expect(ids(evaluateAchievements(short))).not.toContain('flawless-run');

  const long = evaluateAchievements([session(day(1), { calls: 80, failures: 1 })]);
  expect(ids(long)).not.toContain('flawless-run');
});

test('an achievement stays earned after the behaviour that earned it lapses', () => {
  const history = [
    session(day(1), { edits: 60, informed: 58 }), // reads-first is earned here
    session(day(2), { edits: 200, informed: 20 }), // and the habit falls apart afterwards
  ];

  const result = evaluateAchievements(history);
  const earned = badge(result.earned, 'reads-first');

  expect(earned).toBeDefined();
  expect(earned.earned_at).toBe(day(1));
  expect(earned.earned_at_session).toBe(1);
});

test('polyglot needs breadth of models and a real history behind it', () => {
  const models = { 'claude-opus-5': 3, 'claude-sonnet-5': 1, 'claude-haiku-4-5-20251001': 1 };

  const few = Array.from({ length: 5 }, (_, i) => session(day(i + 1), { models }));
  expect(ids(evaluateAchievements(few))).not.toContain('polyglot');

  const many = Array.from({ length: 10 }, (_, i) => session(day(i + 1), { models }));
  expect(ids(evaluateAchievements(many))).toContain('polyglot');
});

// Rules are tested against every prefix, so a coin-flip habit still crosses a bare majority
// on odd-length prefixes. The 60% bar is what stops that from earning a badge.
test('hands-on does not fire on a coin-flip steering habit', () => {
  const half = Array.from({ length: 24 }, (_, i) =>
    session(day((i % 28) + 1), { interrupts: i % 2 === 0 ? 1 : 0 }),
  );
  expect(ids(evaluateAchievements(half))).not.toContain('hands-on');
});

test('hands-on fires when steering is the clear habit', () => {
  const most = Array.from({ length: 24 }, (_, i) =>
    session(day((i % 28) + 1), { interrupts: i % 4 === 0 ? 0 : 1 }),
  );
  const earned = badge(evaluateAchievements(most).earned, 'hands-on');
  expect(earned.evidence).toBe('steered 15 of 20 sessions (75.0%)');
});

test('hands-on needs twenty sessions before the ratio counts', () => {
  const alwaysSteered = Array.from({ length: 12 }, (_, i) => session(day(i + 1), { interrupts: 2 }));
  expect(ids(evaluateAchievements(alwaysSteered))).not.toContain('hands-on');
});

test('toolsmith counts distinct tools across the whole history', () => {
  const tools = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`Tool${i}`, 1]));
  const result = evaluateAchievements([session(day(1), { tools })]);
  expect(ids(result)).toContain('toolsmith');
});

test('getting-better is locked without a trend, and says so', () => {
  const locked = progressOf(evaluateAchievements([session(day(1))], { trend: null }).locked, 'getting-better');
  expect(locked.label).toBe('needs enough history for a trend');
});

test('getting-better requires both halves to carry enough edits', () => {
  const trend = {
    earlier: { sessions: 3, edits: 8, evidence_before_edit: 0.5 },
    recent: { sessions: 3, edits: 400, evidence_before_edit: 0.95 },
    delta: { evidence_before_edit: 0.45 },
  };

  const result = evaluateAchievements([session(day(1))], { trend });
  expect(ids(result)).not.toContain('getting-better');
  expect(progressOf(result.locked, 'getting-better').value).toBe(8);
});

test('getting-better holds on a real improvement and is marked revocable', () => {
  const trend = {
    earlier: { sessions: 5, edits: 100, evidence_before_edit: 0.6 },
    recent: { sessions: 5, edits: 120, evidence_before_edit: 0.85 },
    delta: { evidence_before_edit: 0.25 },
  };

  const result = evaluateAchievements([session(day(3)), session(day(9))], { trend });
  const earned = badge(result.earned, 'getting-better');

  expect(earned.revocable).toBe(true);
  expect(earned.earned_at).toBe(day(9)); // anchored to the last qualifying session
  expect(earned.evidence).toBe('60.0% → 85.0% across 220 edits');
});

test('a flat or falling trend does not earn getting-better', () => {
  const trend = {
    earlier: { sessions: 5, edits: 100, evidence_before_edit: 0.9 },
    recent: { sessions: 5, edits: 100, evidence_before_edit: 0.82 },
    delta: { evidence_before_edit: -0.08 },
  };
  expect(ids(evaluateAchievements([session(day(1))], { trend }))).not.toContain('getting-better');
});

test('earned achievements come back in the order they were earned', () => {
  const history = [
    session(day(1)),
    ...Array.from({ length: 13 }, (_, i) => session(day(i + 2))),
  ];

  const order = ids(evaluateAchievements(history));
  expect(order.indexOf('first-light')).toBeLessThan(order.indexOf('fortnight'));
});

test('every rule appears exactly once, earned or locked', () => {
  const result = evaluateAchievements([session(day(1), { edits: 60, informed: 60 })]);
  const all = [...result.earned, ...result.locked].map((a) => a.id);

  expect(new Set(all).size).toBe(all.length);
  expect(all).toContain('getting-better');
});

test('locked achievements carry progress a profile can render', () => {
  const result = evaluateAchievements([session(day(1)), session(day(2)), session(day(3))]);
  const fortnight = badge(result.locked, 'fortnight');

  expect(fortnight.progress).toEqual({ value: 3, target: 14, label: 'distinct days', ratio: 0.214 });
  expect(fortnight.earned_at).toBeNull();
});

// A rule with a volume floor and a rate has to report whichever one is still blocking it.
test('progress switches to the rate once the volume floor is cleared', () => {
  const thin = evaluateAchievements([session(day(1), { edits: 20, informed: 10 })]);
  expect(progressOf(thin.locked, 'reads-first')).toEqual({
    value: 20,
    target: 50,
    label: 'edits recorded',
    ratio: 0.4,
  });

  // 192 edits at 79.2% informed: the volume stopped being the question a while ago, so
  // reporting "192/50" would say this rule was long since satisfied.
  const volume = evaluateAchievements([session(day(1), { edits: 192, informed: 152 })]);
  expect(progressOf(volume.locked, 'reads-first')).toEqual({
    value: 79.2,
    target: 90,
    label: '% of edits informed',
    ratio: 0.88,
  });
});

test('progress on a lower-is-better rate is measured the right way round', () => {
  const noisy = evaluateAchievements(
    Array.from({ length: 5 }, (_, i) => session(day(i + 1), { calls: 50, failures: 4 })),
  );
  const progress = progressOf(noisy.locked, 'clean-hands');

  expect(progress.value).toBe(8);
  expect(progress.target).toBe(2);
  // 8% against a 2% target is a quarter of the way there, not four times done.
  expect(progress.ratio).toBe(0.25);
});

test('a regressing trend clamps to zero progress rather than going negative', () => {
  const trend = {
    earlier: { sessions: 5, edits: 100, evidence_before_edit: 0.9 },
    recent: { sessions: 5, edits: 100, evidence_before_edit: 0.5 },
    delta: { evidence_before_edit: -0.4 },
  };

  const progress = progressOf(evaluateAchievements([session(day(1))], { trend }).locked, 'getting-better');

  expect(progress.value).toBe(-40);
  expect(progress.ratio).toBe(0);
});

test('every locked achievement carries a sortable completion ratio', () => {
  const result = evaluateAchievements([session(day(1))]);

  for (const locked of result.locked) {
    const { ratio } = progressOf(result.locked, locked.id);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  }
});
