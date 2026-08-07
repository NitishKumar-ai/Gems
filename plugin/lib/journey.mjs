#!/usr/bin/env node
// Gems Phase 2 — journey aggregation.
//
// One session is a snapshot. The claim Gems actually makes is a trajectory: "you used to
// edit before reading; now you read first." That only exists across the store, so this
// reads every captured session and reports both the totals and the direction of travel.
//
// Two things this file refuses to do, because both would put a false number on a public
// profile:
//
//   1. Average a ratio across sessions. A session with one edit and a session with a
//      hundred are not equal evidence. Rates are always recomputed from pooled numerators
//      and denominators.
//   2. Report a trend from too little history. Two sessions is not a journey, it is noise
//      with a direction. Below the threshold the trend is null and says why.

import { readFileSync } from 'node:fs';

export const JOURNEY_SCHEMA_VERSION = 1;

/**
 * Six sessions, so each half of a comparison has three. Below this, a "trend" is one good
 * day next to one bad day and would read on a profile as though it meant something.
 */
export const MIN_SESSIONS_FOR_TREND = 6;

export function parseStore(text) {
  const records = [];
  let corrupt = 0;

  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') records.push(parsed);
      else corrupt += 1;
    } catch {
      corrupt += 1;
    }
  }

  return { records, corrupt };
}

export function readStore(path) {
  try {
    return parseStore(readFileSync(path, 'utf8'));
  } catch {
    return { records: [], corrupt: 0 };
  }
}

/**
 * A resumed session appends a second, larger record for the same id. The last one is the
 * complete session; the earlier ones are prefixes of it, and summing them would count the
 * same work twice.
 */
export function latestPerSession(records) {
  const bySession = new Map();

  for (const record of records) {
    const id = record?.session_id;
    if (typeof id !== 'string' || id.length === 0) continue;
    bySession.set(id, record);
  }

  return [...bySession.values()];
}

/** Sessions sorted oldest first, by when the work happened rather than when it was captured. */
export function sortSessions(sessions) {
  const at = (s) => s?.metrics?.started_at ?? s?.captured_at ?? '';
  return [...sessions].sort((a, b) => String(at(a)).localeCompare(String(at(b))));
}

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

function ratio(numerator, denominator) {
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

  return {
    earlier: { sessions: a.sessions, ...a.rates },
    recent: { sessions: b.sessions, ...b.rates },
    delta: {
      evidence_before_edit: delta(a.rates.evidence_before_edit, b.rates.evidence_before_edit),
      invalid_action: delta(a.rates.invalid_action, b.rates.invalid_action),
      turns_per_prompt: delta(a.rates.turns_per_prompt, b.rates.turns_per_prompt),
    },
  };
}

export function buildJourney(records, { minSessionsForTrend = MIN_SESSIONS_FOR_TREND } = {}) {
  const sessions = sortSessions(latestPerSession(records));
  const totals = aggregate(sessions);

  // Only sessions with metrics can be compared, so the threshold is measured against those
  // rather than against how many rows happen to be in the store.
  const extracted = sessions.filter((s) => s?.metrics && typeof s.metrics === 'object');

  let trend = null;
  if (extracted.length >= minSessionsForTrend) {
    const firstTime = new Date(extracted[0].metrics?.started_at ?? extracted[0].captured_at).getTime();
    const lastTime = new Date(
      extracted[extracted.length - 1].metrics?.started_at ?? extracted[extracted.length - 1].captured_at
    ).getTime();
    const midpointTime = firstTime + (lastTime - firstTime) / 2;

    const earlier = [];
    const recent = [];
    for (const session of extracted) {
      const time = new Date(session.metrics?.started_at ?? session.captured_at).getTime();
      if (time < midpointTime) earlier.push(session);
      else recent.push(session);
    }

    trend = compareWindows(earlier, recent);
  }

  return {
    schema: JOURNEY_SCHEMA_VERSION,
    first_session_at: sessions.length ? (sessions[0].metrics?.started_at ?? sessions[0].captured_at ?? null) : null,
    last_session_at: sessions.length
      ? (sessions[sessions.length - 1].metrics?.ended_at ?? sessions[sessions.length - 1].captured_at ?? null)
      : null,
    totals,
    trend,
    trend_unavailable_reason:
      trend === null ? `needs ${minSessionsForTrend} extracted sessions, have ${extracted.length}` : null,
  };
}
