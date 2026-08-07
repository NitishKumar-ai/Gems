#!/usr/bin/env node
// Gems Phase 5 — achievements.
//
// The README's design constraint for this phase: assume people will try to farm them. That
// assumption drives three decisions here, and they matter more than the catalog itself.
//
//   1. Empty sessions count for nothing. A session that opened and closed has zero tool
//      calls, so its failure rate is a perfect 0% and its evidence-before-edit rate is an
//      undefined that reads as "no mistakes". Any rule counting sessions is farmed by
//      quitting Claude Code in a loop unless sessions have to earn their place first.
//      `qualifies()` is the gate, and it is the load-bearing part of this file.
//
//   2. Ratios need a floor under the denominator. Informing one edit out of one is 100% and
//      is not evidence of anything. Every ratio rule carries a minimum volume alongside the
//      rate, and both have to hold at the same time.
//
//   3. Consistency is measured in calendar days, never in session count. Fourteen sessions
//      can happen in an afternoon; fourteen distinct days cannot be compressed.
//
// Achievements are evaluated by walking history forward and testing every prefix. The first
// prefix where a rule holds is when it was earned, and it stays earned after that. The
// alternative — testing the trailing window — makes badges blink out on a bad week, which
// turns a record of what you did into a readout of how you are doing right now. Those are
// different products, and this one is the record.
//
// `getting-better` is the deliberate exception. It is a present-tense claim about direction
// of travel, so it is allowed to lapse, and it is marked `revocable` so nothing has to infer
// that from behaviour.

export const ACHIEVEMENTS_SCHEMA_VERSION = 1;

/**
 * What a session has to contain before it counts toward anything. Low enough that real work
 * always clears it, high enough that a session opened and abandoned never does.
 */
export const QUALIFYING_TOOL_CALLS = 5;
export const QUALIFYING_ASSISTANT_TURNS = 3;

/** Rules are grouped by how much the badge is actually worth, and profiles say so. */
export const BASIS = {
  MILESTONE: 'milestone',
  RATIO: 'ratio',
  CONSISTENCY: 'consistency',
  TREND: 'trend',
};

/**
 * @typedef {object} Progress
 * @property {number} value Where the builder is now, in the units named by `label`.
 * @property {number} target Where they need to get to.
 * @property {string} label What the two numbers are counting.
 * @property {number} ratio 0–1 completion, for sorting. Separate from value/target because
 *   the two stop agreeing on any metric where lower is better.
 */

/**
 * @typedef {object} Achievement
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} basis
 * @property {string | null} earned_at
 * @property {boolean} [revocable]
 * @property {boolean} [held]
 * @property {number} [earned_at_session]
 * @property {string} [evidence]
 * @property {Progress} [progress]
 */

/**
 * @typedef {object} Window
 * @property {number} [edits]
 * @property {number | null} [evidence_before_edit]
 */

/**
 * @typedef {object} Trend
 * @property {Window} earlier
 * @property {Window} recent
 * @property {{ evidence_before_edit?: number | null }} delta
 */

/**
 * @typedef {object} AchievementsResult
 * @property {number} schema
 * @property {number} qualifying_sessions
 * @property {number} ignored_sessions
 * @property {Achievement[]} earned
 * @property {Achievement[]} locked
 */

export function qualifies(session) {
  const m = session?.metrics;
  if (!m || typeof m !== 'object') return false;
  return (m.tools?.calls ?? 0) >= QUALIFYING_TOOL_CALLS && (m.turns?.assistant ?? 0) >= QUALIFYING_ASSISTANT_TURNS;
}

/**
 * Days and weeks are bucketed in UTC, not local time. Two machines in different timezones
 * must agree on whether a streak held, and a profile that changes when you fly somewhere is
 * a bug rather than a feature.
 */
function utcDay(iso) {
  const t = new Date(iso ?? '').getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function isoWeek(iso) {
  const t = new Date(iso ?? '').getTime();
  if (!Number.isFinite(t)) return null;

  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  // ISO weeks belong to the year containing their Thursday, which is why this cannot just
  // divide the day-of-year by seven.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil((d.getTime() - yearStart) / 86400000 / 7 + 1 / 7);

  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Progress on a rule with two conditions has to describe the one still blocking it. A rule
 * needing 50 edits at 90% informed, sat at 192 edits and 79%, is not "192/50 done" — the
 * volume stopped being the question a while ago.
 *
 * `ratio` is the separate 0–1 completion figure, because "how close is this" and "what
 * should it say" stop agreeing the moment a metric is one where lower is better.
 */
function step(value, target, label, { inverted = false } = {}) {
  const ratio = inverted
    ? (value <= target ? 1 : Math.max(0, Math.min(1, target / value)))
    : (target <= 0 ? 1 : Math.max(0, Math.min(1, value / target)));

  return { value, target, label, ratio: Math.round(ratio * 1000) / 1000 };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * The catalog.
 *
 * `check` runs against the running state after each qualifying session is absorbed and
 * returns the evidence string when the rule has just been satisfied, or null. `progress`
 * describes how far along a rule that has not fired yet is, so a locked badge can say
 * "9 of 14 days" instead of sitting there inert.
 */
export const RULES = [
  {
    id: 'first-light',
    title: 'First Light',
    description: 'Captured a first session with real work in it.',
    basis: BASIS.MILESTONE,
    check: (s) => (s.qualifying >= 1 ? `${s.current.tools} tool calls across ${s.current.turns} assistant turns` : null),
    progress: (s) => step(s.qualifying, 1, 'sessions with real work in them'),
  },
  {
    id: 'toolsmith',
    title: 'Toolsmith',
    description: 'Reached for 12 different tools. Breadth, not depth — a cheap badge, and labelled as one.',
    basis: BASIS.MILESTONE,
    check: (s) => (s.tools.size >= 12 ? `${s.tools.size} distinct tools used` : null),
    progress: (s) => step(s.tools.size, 12, 'distinct tools'),
  },
  {
    id: 'polyglot',
    title: 'Polyglot',
    description: 'Worked with three or more models across at least ten real sessions.',
    basis: BASIS.MILESTONE,
    check: (s) =>
      s.models.size >= 3 && s.qualifying >= 10
        ? `${s.models.size} models across ${s.qualifying} sessions`
        : null,
    progress: (s) =>
      s.models.size < 3
        ? step(s.models.size, 3, 'distinct models')
        : step(s.qualifying, 10, 'sessions, with 3 models already used'),
  },
  {
    id: 'reads-first',
    title: 'Reads First',
    description: 'Informed 90% of edits with a read, grep, or test — held across 50 edits.',
    basis: BASIS.RATIO,
    check: (s) => {
      const r = rate(s.informed, s.edits);
      return s.edits >= 50 && r !== null && r >= 0.9 ? `informed ${s.informed} of ${s.edits} edits (${pct(r)})` : null;
    },
    progress: (s) =>
      s.edits < 50
        ? step(s.edits, 50, 'edits recorded')
        : step(round1(rate(s.informed, s.edits) * 100), 90, '% of edits informed'),
  },
  {
    id: 'clean-hands',
    title: 'Clean Hands',
    description: 'Kept failed tool calls under 2% across 200 calls.',
    basis: BASIS.RATIO,
    check: (s) => {
      const r = rate(s.toolFailures, s.toolCalls);
      return s.toolCalls >= 200 && r !== null && r <= 0.02
        ? `${s.toolFailures} failures in ${s.toolCalls} calls (${pct(r)})`
        : null;
    },
    progress: (s) =>
      s.toolCalls < 200
        ? step(s.toolCalls, 200, 'tool calls recorded')
        : step(round1(rate(s.toolFailures, s.toolCalls) * 100), 2, '% of calls failed, needs to come down', {
            inverted: true,
          }),
  },
  {
    id: 'flawless-run',
    title: 'Flawless Run',
    description: 'Finished a single session of 50+ tool calls without one failing.',
    basis: BASIS.RATIO,
    check: (s) =>
      s.current.toolCalls >= 50 && s.current.toolFailures === 0
        ? `${s.current.toolCalls} tool calls, zero failures`
        : null,
    progress: (s) => step(s.bestCleanRun, 50, 'tool calls in your longest failure-free session'),
  },
  {
    id: 'fortnight',
    title: 'Fortnight',
    description: 'Did real work on 14 separate days.',
    basis: BASIS.CONSISTENCY,
    check: (s) => (s.days.size >= 14 ? `${s.days.size} distinct days` : null),
    progress: (s) => step(s.days.size, 14, 'distinct days'),
  },
  {
    id: 'long-haul',
    title: 'Long Haul',
    description: 'Showed up in eight different calendar weeks. The one badge that takes two months.',
    basis: BASIS.CONSISTENCY,
    check: (s) => (s.weeks.size >= 8 ? `${s.weeks.size} distinct weeks` : null),
    progress: (s) => step(s.weeks.size, 8, 'distinct weeks'),
  },
  {
    id: 'hands-on',
    title: 'Hands On',
    description: 'Stopped and redirected the agent in 60% of 20+ sessions.',
    basis: BASIS.CONSISTENCY,
    // 60% rather than a bare majority. Rules are tested against every prefix of history, so
    // a habit that is genuinely a coin flip still crosses 50% on odd-length prefixes — 11 of
    // 21 is a majority, and it would earn a badge that claims a habit on the strength of
    // noise. The gap above half is what makes the claim mean something.
    check: (s) => {
      const r = rate(s.sessionsWithInterrupt, s.qualifying);
      return s.qualifying >= 20 && r !== null && r >= 0.6
        ? `steered ${s.sessionsWithInterrupt} of ${s.qualifying} sessions (${pct(r)})`
        : null;
    },
    progress: (s) =>
      s.qualifying < 20
        ? step(s.qualifying, 20, `sessions, ${s.sessionsWithInterrupt} with a course correction`)
        : step(round1(rate(s.sessionsWithInterrupt, s.qualifying) * 100), 60, '% of sessions steered'),
  },
];

/**
 * Evaluated after the walk rather than inside it, because it reads the journey's own trend
 * and there is exactly one of those. Also the only rule that can lapse — see the file header.
 */
export const TREND_RULE = {
  id: 'getting-better',
  title: 'Getting Better',
  description: 'Evidence-before-edit is up 10 points or more against your own earlier sessions.',
  basis: BASIS.TREND,
  revocable: true,
  minEditsPerWindow: 25,
  minDelta: 0.1,
};

function newState() {
  return {
    qualifying: 0,
    days: new Set(),
    weeks: new Set(),
    models: new Set(),
    tools: new Set(),
    edits: 0,
    informed: 0,
    toolCalls: 0,
    toolFailures: 0,
    sessionsWithInterrupt: 0,
    bestCleanRun: 0,
    current: null,
  };
}

function absorb(state, session) {
  const m = session.metrics;

  state.qualifying += 1;

  const when = m.started_at ?? session.captured_at;
  const day = utcDay(when);
  const week = isoWeek(when);
  if (day) state.days.add(day);
  if (week) state.weeks.add(week);

  for (const model of Object.keys(m.models ?? {})) state.models.add(model);
  for (const tool of Object.keys(m.tools?.by_name ?? {})) state.tools.add(tool);

  const toolCalls = m.tools?.calls ?? 0;
  const toolFailures = m.invalid_actions?.tool_failures ?? 0;

  state.edits += m.evidence_before_edit?.edits ?? 0;
  state.informed += m.evidence_before_edit?.informed ?? 0;
  state.toolCalls += toolCalls;
  state.toolFailures += toolFailures;
  if ((m.steering?.interrupts ?? 0) > 0) state.sessionsWithInterrupt += 1;
  if (toolFailures === 0) state.bestCleanRun = Math.max(state.bestCleanRun, toolCalls);

  state.current = {
    at: when ?? null,
    ordinal: state.qualifying,
    tools: toolCalls,
    toolCalls,
    toolFailures,
    turns: m.turns?.assistant ?? 0,
  };
}

/**
 * @param {any[]} sessions Sorted oldest-first and deduplicated — `buildJourney` does both.
 * @param {{ trend?: Trend | null }} [options] `trend` is the journey's computed trend, or
 *   null when there is not enough history to have one.
 * @returns {AchievementsResult}
 */
export function evaluateAchievements(sessions, { trend = null } = {}) {
  const state = newState();
  /** @type {Map<string, Achievement>} */
  const earned = new Map();
  let ignored = 0;

  for (const session of sessions ?? []) {
    if (!qualifies(session)) {
      ignored += 1;
      continue;
    }

    absorb(state, session);

    for (const rule of RULES) {
      if (earned.has(rule.id)) continue;
      const evidence = rule.check(state);
      if (!evidence) continue;

      earned.set(rule.id, {
        id: rule.id,
        title: rule.title,
        description: rule.description,
        basis: rule.basis,
        revocable: false,
        earned_at: state.current.at,
        // The ordinal, never the session id. Session ids are Claude Code UUIDs, and this
        // artifact is built to be published — "your 12th session" is just as traceable
        // locally and carries no identifier off the machine.
        earned_at_session: state.current.ordinal,
        evidence,
      });
    }
  }

  /** @type {Achievement[]} */
  const locked = RULES.filter((rule) => !earned.has(rule.id)).map((rule) => ({
    id: rule.id,
    title: rule.title,
    description: rule.description,
    basis: rule.basis,
    earned_at: null,
    progress: rule.progress(state),
  }));

  // Anchored to the last qualifying session rather than to whenever the profile was
  // rendered: the claim is about the work, so it should not appear to refresh itself on a
  // day nothing was captured.
  const trendAchievement = evaluateTrendRule(trend, state.current?.at ?? null);
  if (trendAchievement.held) earned.set(TREND_RULE.id, trendAchievement);
  else locked.push(trendAchievement);

  return {
    schema: ACHIEVEMENTS_SCHEMA_VERSION,
    qualifying_sessions: state.qualifying,
    ignored_sessions: ignored,
    earned: [...earned.values()].sort((a, b) => String(a.earned_at).localeCompare(String(b.earned_at))),
    locked,
  };
}

/**
 * @param {Trend | null} trend
 * @param {string | null} asOf
 * @returns {Achievement}
 */
function evaluateTrendRule(trend, asOf) {
  /** @type {Achievement} */
  const base = {
    id: TREND_RULE.id,
    title: TREND_RULE.title,
    description: TREND_RULE.description,
    basis: TREND_RULE.basis,
    revocable: true,
    held: false,
    earned_at: null,
  };

  if (!trend) {
    return { ...base, progress: step(0, 1, 'needs enough history for a trend') };
  }

  const { minEditsPerWindow, minDelta } = TREND_RULE;
  const earlierEdits = trend.earlier?.edits ?? 0;
  const recentEdits = trend.recent?.edits ?? 0;
  const delta = trend.delta?.evidence_before_edit;

  if (earlierEdits < minEditsPerWindow || recentEdits < minEditsPerWindow) {
    return {
      ...base,
      progress: step(
        Math.min(earlierEdits, recentEdits),
        minEditsPerWindow,
        'edits in the thinner half of your history',
      ),
    };
  }

  if (typeof delta !== 'number' || delta < minDelta) {
    // A regression is zero progress toward "improving", not negative progress — `step`
    // clamps, so a falling trend sorts last instead of below the floor.
    return {
      ...base,
      progress: step(
        typeof delta === 'number' ? round1(delta * 100) : 0,
        minDelta * 100,
        'points of evidence-before-edit improvement',
      ),
    };
  }

  return {
    ...base,
    held: true,
    earned_at: asOf,
    evidence: `${pct(trend.earlier.evidence_before_edit)} → ${pct(trend.recent.evidence_before_edit)} across ${earlierEdits + recentEdits} edits`,
  };
}
