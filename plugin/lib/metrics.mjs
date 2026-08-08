#!/usr/bin/env node
// Gems — shared aggregation primitives.
//
// Extracted from journey.mjs when the rubric feature needed the same pooling and windowing
// logic: journey.mjs orchestrates achievements.mjs and rubric.mjs, and rubric.mjs needed
// these same functions, which would have made journey.mjs and rubric.mjs import each other.
// This file has no dependency on either — it is the leaf both import from.
//
// The pooling philosophy this file exists to enforce: a session with one edit and a session
// with a hundred are not equal evidence, so rates are always recomputed from pooled
// numerators and denominators, never averaged across sessions.

/**
 * Six sessions, so each half of a comparison has three. Below this, a "trend" is one good
 * day next to one bad day and would read on a profile as though it meant something.
 */
export const MIN_SESSIONS_FOR_TREND = 6;

function addCounts(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    target.set(key, (target.get(key) ?? 0) + value);
  }
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
}

export function ratio(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/**
 * Pool every session's raw counts, then derive the rates once. Never mean-of-ratios.
 */
export function aggregate(sessions) {
  const models = new Map();
  const tools = new Map();
  const signals = new Map();

  const totals = {
    sessions: 0,
    unextracted: 0,
    assistant_turns: 0,
    prompts: 0,
    commands: 0,
    interrupts: 0,
    tool_calls: 0,
    tool_failures: 0,
    api_errors: 0,
    edits: 0,
    informed_edits: 0,
    creates: 0,
    verify_calls: 0,
    duration_ms: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  };

  for (const session of sessions) {
    const m = session?.metrics;

    // A Phase 1 record, or a session whose transcript was gone by extraction time. Counted
    // so the profile can say how much of the history is thin, rather than quietly
    // presenting a partial store as a complete one.
    if (!m || typeof m !== 'object') {
      totals.unextracted += 1;
      continue;
    }

    totals.sessions += 1;
    addCounts(models, m.models);
    addCounts(tools, m.tools?.by_name);
    addCounts(signals, m.invalid_actions?.by_signal);

    totals.assistant_turns += m.turns?.assistant ?? 0;
    totals.prompts += m.steering?.prompts ?? 0;
    totals.commands += m.steering?.commands ?? 0;
    totals.interrupts += m.steering?.interrupts ?? 0;
    totals.tool_calls += m.tools?.calls ?? 0;
    totals.tool_failures += m.invalid_actions?.tool_failures ?? 0;
    totals.api_errors += m.invalid_actions?.api_errors ?? 0;
    totals.edits += m.evidence_before_edit?.edits ?? 0;
    totals.informed_edits += m.evidence_before_edit?.informed ?? 0;
    totals.creates += m.evidence_before_edit?.creates ?? 0;
    totals.verify_calls += m.evidence_before_edit?.verify_calls ?? 0;
    totals.duration_ms += m.duration_ms ?? 0;

    for (const key of Object.keys(totals.tokens)) {
      totals.tokens[key] += m.tokens?.[key] ?? 0;
    }
  }

  return {
    ...totals,
    models: sortedCounts(models),
    tools: sortedCounts(tools),
    failure_signals: sortedCounts(signals),
    rates: {
      evidence_before_edit: ratio(totals.informed_edits, totals.edits),
      invalid_action: ratio(totals.tool_failures, totals.tool_calls),
      turns_per_prompt: ratio(totals.assistant_turns, totals.prompts + totals.commands),
      // Event-level: interrupts / prompts. Deliberately distinct from achievements.mjs's
      // `hands-on` badge, which is a SESSION-level ratio (fraction of sessions with >=1
      // interrupt, crossed once, permanently). This one measures how often a prompt gets
      // interrupted at all; its *trend* (compareWindows' delta below), not this raw rate,
      // is what the rubric's Prompt Craft dimension scores. A session with zero prompts
      // cannot have a nonzero interrupt count, so pooling already excludes it from moving
      // this ratio — no separate per-session qualifying filter is needed.
      steering_rate_event: ratio(totals.interrupts, totals.prompts),
    },
  };
}

/**
 * Split the history in half and compare. `delta` is `recent - earlier`, so a positive
 * Evidence-Before-Edit delta means the habit improved and a positive invalid-action delta
 * means it got worse — the sign always follows the metric, never a notion of "good".
 *
 * A metric with no denominator in one half yields a null delta rather than a number
 * standing in for absent evidence.
 */
export function compareWindows(earlier, recent) {
  const a = aggregate(earlier);
  const b = aggregate(recent);

  const delta = (x, y) => (x === null || y === null ? null : Math.round((y - x) * 10000) / 10000);

  // The raw counts ride along with the rates. A delta of "+12 points" is not reviewable
  // without knowing whether it moved across nine edits or nine hundred, and Phase 5's
  // trend achievement needs exactly that floor to decide whether the direction is real.
  return {
    earlier: { sessions: a.sessions, edits: a.edits, tool_calls: a.tool_calls, ...a.rates },
    recent: { sessions: b.sessions, edits: b.edits, tool_calls: b.tool_calls, ...b.rates },
    delta: {
      evidence_before_edit: delta(a.rates.evidence_before_edit, b.rates.evidence_before_edit),
      invalid_action: delta(a.rates.invalid_action, b.rates.invalid_action),
      turns_per_prompt: delta(a.rates.turns_per_prompt, b.rates.turns_per_prompt),
      steering_rate_event: delta(a.rates.steering_rate_event, b.rates.steering_rate_event),
    },
  };
}

/**
 * Split sessions into earlier/recent halves by time midpoint, not by list position — a
 * burst of ten sessions in one afternoon after a quiet month should not count as "half the
 * history" just because it's half the list.
 */
export function splitAtMidpoint(sessions) {
  if (sessions.length === 0) return { earlier: [], recent: [] };

  const at = (s) => new Date(s.metrics?.started_at ?? s.captured_at).getTime();
  const firstTime = at(sessions[0]);
  const lastTime = at(sessions[sessions.length - 1]);
  const midpointTime = firstTime + (lastTime - firstTime) / 2;

  const earlier = [];
  const recent = [];
  for (const session of sessions) {
    if (at(session) < midpointTime) earlier.push(session);
    else recent.push(session);
  }

  return { earlier, recent };
}

/**
 * The last `n` sessions, live and sliding — unlike `compareWindows`' half-split over full
 * history, this window moves forward every time a new session lands, so it reflects recent
 * behavior rather than a permanent floor. Returns `null` when fewer than `n` sessions exist
 * yet, so the caller renders a locked/progress state instead of a rate computed from a
 * window that isn't full — never a rate silently computed over fewer sessions than promised.
 */
export function trailingWindow(sessions, n) {
  if (sessions.length < n) return null;

  const agg = aggregate(sessions.slice(-n));
  return { sessions: agg.sessions, edits: agg.edits, tool_calls: agg.tool_calls, ...agg.rates };
}
