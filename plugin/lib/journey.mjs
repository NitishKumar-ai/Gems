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
//
// The pooling/windowing primitives (aggregate, compareWindows, splitAtMidpoint,
// trailingWindow) live in metrics.mjs, not here — rubric.mjs needs the same functions, and
// having both journey.mjs and rubric.mjs import each other would be a circular dependency.
// This file re-exports them so nothing outside this pair has to know metrics.mjs exists.

import { readFileSync } from 'node:fs';

import { evaluateAchievements } from './achievements.mjs';
import { aggregate, compareWindows, MIN_SESSIONS_FOR_TREND, splitAtMidpoint, trailingWindow } from './metrics.mjs';
import { evaluateRubric } from './rubric.mjs';

export { aggregate, compareWindows, MIN_SESSIONS_FOR_TREND, splitAtMidpoint, trailingWindow };

/**
 * 4 — added the `rubric` key, the raw signals plugin/lib/rubric.mjs scores at render time.
 * 3 — the rubric feature added `steering_rate_event` to `rates`/`delta` (an event-level
 * interrupts/prompts ratio, distinct from `hands-on`'s session-level ratio in
 * achievements.mjs) and the `trailingWindow` function for live, sliding-window rates.
 * 2 — Phase 5 added `achievements`, and window summaries gained their raw counts.
 */
export const JOURNEY_SCHEMA_VERSION = 4;

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

export function buildJourney(records, { minSessionsForTrend = MIN_SESSIONS_FOR_TREND } = {}) {
  const sessions = sortSessions(latestPerSession(records));
  const totals = aggregate(sessions);

  // Only sessions with metrics can be compared, so the threshold is measured against those
  // rather than against how many rows happen to be in the store.
  const extracted = sessions.filter((s) => s?.metrics && typeof s.metrics === 'object');

  let trend = null;
  if (extracted.length >= minSessionsForTrend) {
    const { earlier, recent } = splitAtMidpoint(extracted);
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
    // Fed the same sorted, deduplicated list the totals came from, so a badge and the number
    // it claims to be derived from can never disagree about which sessions exist.
    achievements: evaluateAchievements(sessions, { trend }),
    // Raw rubric signals — buildJourney is the only place with access to raw session data
    // (page.tsx only ever reads the frozen JSON this produces), so this is the one place
    // they can be computed. Band interpolation happens later, live, against these.
    rubric: evaluateRubric(sessions),
  };
}
