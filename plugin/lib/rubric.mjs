#!/usr/bin/env node
// Gems — rubric.
//
// Achievements prove moments happened. This proves a trajectory, the same way journey.mjs's
// own trend does — four scored dimensions, derived from signals journey.mjs already
// computes, each backed by the session data that produced it rather than an opaque label.
//
// Three decisions carried over from achievements.mjs, because the same farming risk applies
// to a score as to a badge:
//
//   1. The qualifying-session gate applies here too. `qualifies()` (achievements.mjs) is
//      reused, not reimplemented — a session that opened and closed contributes to nothing.
//   2. A score is never fabricated from insufficient data. Below a dimension's floor, it is
//      `locked` with a progress indicator, the same shape achievements uses for a locked
//      badge — never a default-zero or invented number.
//   3. Evidence trails carry only aggregate counts already in the longitudinal store — never
//      raw prompt text, file paths, or tool-call content. What's a receipt for a session
//      count is not a receipt for what was inside the session.
//
// One decision this file adds on top: raw signals are computed once, here, at publish time
// (buildJourney is the only place with access to raw sessions — page.tsx only ever reads the
// frozen JSON this produces). The *band* a raw signal maps to is a separate, later step —
// live interpolation against the current threshold table in shared/rubric-bands.mjs, imported
// by both this file's consumers and src/lib/rubric.ts for the app side. One table, one
// interpolateBand() — a later band recalibration changes what every consumer renders without
// anyone needing to republish.

import { pct, qualifies, step } from './achievements.mjs';
import { aggregate, compareWindows, MIN_SESSIONS_FOR_TREND, splitAtMidpoint, trailingWindow } from './metrics.mjs';

/** Raw signal shape written into the published blob by evaluateRubric(). */
export const RUBRIC_SIGNAL_SCHEMA_VERSION = 1;

/** Matches `reads-first`'s floor exactly — this dimension shares its underlying data. */
export const EVIDENCE_DISCIPLINE_EDIT_FLOOR = 50;

/** Trailing window matches Execution Hygiene's design (scaled down from hands-on's 20). */
export const EXECUTION_HYGIENE_TRAILING_SESSIONS = 10;

/**
 * Below this magnitude, a delta is noise, not direction — Learning Velocity's majority vote
 * would otherwise let a +0.1 percentage-point wobble count the same as a real swing.
 */
export const LEARNING_VELOCITY_TOLERANCE = {
  evidence_before_edit: 0.03,
  invalid_action: 0.02,
  steering_rate_event: 0.03,
};

function scoreEvidenceDiscipline(qualifying) {
  const agg = aggregate(qualifying);

  if (agg.edits < EVIDENCE_DISCIPLINE_EDIT_FLOOR) {
    return {
      id: 'evidence-discipline',
      locked: true,
      progress: step(agg.edits, EVIDENCE_DISCIPLINE_EDIT_FLOOR, 'edits recorded'),
    };
  }

  const rate = agg.rates.evidence_before_edit;

  return {
    id: 'evidence-discipline',
    locked: false,
    // The raw rate, not an interpolated score. Publish-time freezes the RATE (cumulative-
    // earned — a lapse doesn't erase prior discipline, the same guarantee achievements
    // gives `reads-first`); turning it into a 0-10 score against EVIDENCE_DISCIPLINE_BANDS
    // is a render-time step (interpolateBand, called by the consumer — src/lib/rubric.ts
    // for the web page, or a local CLI preview), so a later band recalibration changes what
    // renders without needing anyone to republish.
    value: rate,
    evidence: `${agg.informed_edits}/${agg.edits} edits informed (${pct(rate)})`,
  };
}

function scorePromptCraft(qualifying, windows) {
  if (qualifying.length < MIN_SESSIONS_FOR_TREND) {
    return {
      id: 'prompt-craft',
      locked: true,
      progress: step(qualifying.length, MIN_SESSIONS_FOR_TREND, 'qualifying sessions'),
    };
  }

  const delta = windows.delta.steering_rate_event;
  if (delta === null) {
    return {
      id: 'prompt-craft',
      locked: true,
      progress: step(0, 1, 'needs prompts recorded in both halves of your history'),
    };
  }

  return {
    id: 'prompt-craft',
    locked: false,
    // Raw delta, not an interpolated score — see the note on Evidence Discipline above.
    value: delta,
    evidence: `steering ${pct(windows.earlier.steering_rate_event)} → ${pct(windows.recent.steering_rate_event)}`,
  };
}

function scoreExecutionHygiene(qualifying) {
  const window = trailingWindow(qualifying, EXECUTION_HYGIENE_TRAILING_SESSIONS);

  if (window === null || window.invalid_action === null) {
    return {
      id: 'execution-hygiene',
      locked: true,
      progress: step(qualifying.length, EXECUTION_HYGIENE_TRAILING_SESSIONS, 'qualifying sessions'),
    };
  }

  return {
    id: 'execution-hygiene',
    locked: false,
    // Raw rate, not an interpolated score — see the note on Evidence Discipline above.
    value: window.invalid_action,
    evidence: `${window.tool_calls} tool calls over the trailing ${window.sessions} sessions, ${pct(window.invalid_action)} failed`,
  };
}

/** `null` when the delta itself is unavailable — a distinct case from "flat". */
function classifyDirection(delta, tolerance, { higherIsBetter }) {
  if (delta === null) return null;
  if (Math.abs(delta) < tolerance) return 'flat';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'improved' : 'declined';
}

function scoreLearningVelocity(qualifying, windows) {
  if (qualifying.length < MIN_SESSIONS_FOR_TREND) {
    return {
      id: 'learning-velocity',
      locked: true,
      progress: step(qualifying.length, MIN_SESSIONS_FOR_TREND, 'qualifying sessions'),
    };
  }

  const directions = [
    classifyDirection(windows.delta.evidence_before_edit, LEARNING_VELOCITY_TOLERANCE.evidence_before_edit, {
      higherIsBetter: true,
    }),
    classifyDirection(windows.delta.invalid_action, LEARNING_VELOCITY_TOLERANCE.invalid_action, {
      higherIsBetter: false,
    }),
    classifyDirection(windows.delta.steering_rate_event, LEARNING_VELOCITY_TOLERANCE.steering_rate_event, {
      higherIsBetter: false,
    }),
  ];

  if (directions.some((d) => d === null)) {
    return {
      id: 'learning-velocity',
      locked: true,
      progress: step(0, 1, 'needs all three other dimensions to have a computable trend'),
    };
  }

  const counts = { improved: 0, flat: 0, declined: 0 };
  for (const d of directions) counts[d] += 1;

  // 2-of-3 agreement reports that direction. A true no-majority spread (one of each) is
  // `mixed` — a distinct, honest state rather than a fake tiebreak toward a direction the
  // data doesn't support.
  const majority = Object.entries(counts).find(([, n]) => n >= 2);

  return {
    id: 'learning-velocity',
    locked: false,
    direction: majority ? majority[0] : 'mixed',
    directions: { evidence_before_edit: directions[0], invalid_action: directions[1], steering_rate_event: directions[2] },
  };
}

/**
 * @param {any[]} sessions Sorted oldest-first and deduplicated — the same list
 *   `buildJourney` builds and feeds to `evaluateAchievements`.
 */
export function evaluateRubric(sessions) {
  const qualifying = (sessions ?? []).filter(qualifies);

  // Computed once, shared by Prompt Craft and Learning Velocity — both read from the same
  // recent-vs-older split over the qualifying subset, so they can never disagree about which
  // sessions counted as "earlier" and which as "recent". Both callees re-check this same
  // length condition before touching `windows`, so `null` here is never dereferenced.
  let windows = null;
  if (qualifying.length >= MIN_SESSIONS_FOR_TREND) {
    const { earlier, recent } = splitAtMidpoint(qualifying);
    windows = compareWindows(earlier, recent);
  }

  return {
    // Only the raw-signal shape version — band_version/provisional/calibrated-at describe
    // how to *interpret* a signal, not the signal itself, so they live in src/lib/rubric.ts
    // as constants read live at render time. Freezing them here would mean a later band
    // recalibration couldn't change what an old published profile displays, which is
    // exactly the bug the live-interpolation design exists to avoid.
    schema: RUBRIC_SIGNAL_SCHEMA_VERSION,
    qualifying_sessions: qualifying.length,
    dimensions: {
      'evidence-discipline': scoreEvidenceDiscipline(qualifying),
      'prompt-craft': scorePromptCraft(qualifying, windows),
      'execution-hygiene': scoreExecutionHygiene(qualifying),
      'learning-velocity': scoreLearningVelocity(qualifying, windows),
    },
  };
}
