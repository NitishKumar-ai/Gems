// Gems — rubric band interpolation (app side).
//
// This is a deliberate duplicate of plugin/lib/rubric.mjs's interpolateBand() and band
// tables, not a shared import. Nothing in src/ currently imports plugin/lib/*.mjs — the
// plugin has its own, separately-checked tsconfig.json (`typecheck:plugin` runs
// independently from `next build`), and forcing a cross-project import here was judged
// more blast radius than this feature justifies (see the design doc's Engineering Review
// Resolutions). If you change a band table in plugin/lib/rubric.mjs, change it here too —
// this comment pairing, plus matching boundary-value test cases in both suites, is the
// whole guard against the two silently disagreeing.
//
// Why this file exists at all rather than reusing a pre-computed score: buildJourney()
// (plugin/lib/journey.mjs) is the only place with access to raw session data, so it freezes
// the RAW signal (a rate or a delta) into the published blob at publish time. Turning that
// raw signal into a 0-10 score is this file's job, done live at render time — so a later
// band recalibration (bumping RUBRIC_BAND_VERSION below) changes what a published profile
// displays without anyone needing to republish.

/**
 * Which threshold table produced a score, read live — NOT stored in the published blob.
 * Bump this whenever a band table below changes. Surfaced as "bands as of {date}" in the UI.
 */
export const RUBRIC_BAND_VERSION = 1;

/**
 * These are LLM-proposed starting defaults (from the /office-hours design session), not
 * validated against a real distribution of builder journeys yet. Tracked in TODOS.md
 * ("Rubric bands need real-data calibration", P2). The UI shows a "provisional" indicator
 * while this is true; flip it only alongside resolving that TODO.
 */
export const RUBRIC_BANDS_PROVISIONAL = true;
export const RUBRIC_BAND_CALIBRATED_AT = '2026-08-08';

type BandAnchor = readonly [threshold: number, score: number];

/**
 * Linear interpolation between named band anchors — never a discrete jump between them, so
 * trend arrows and deltas stay meaningful at fine grain. `anchors` is a list of
 * `[threshold, score]` pairs sorted ascending by threshold; score does not need to be
 * ascending (Execution Hygiene's bands descend, since a lower rate is better).
 *
 * A value below the first anchor or above the last clamps to that anchor's score. A value
 * exactly on a threshold resolves to that anchor's own score — inclusive-lower-bound,
 * matching the `>=` convention the plugin's achievement thresholds already use.
 */
export function interpolateBand(value: number, anchors: readonly BandAnchor[]): number {
  if (value <= anchors[0][0]) return anchors[0][1];
  if (value >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];

  for (let i = 1; i < anchors.length; i += 1) {
    const [hiThreshold, hiScore] = anchors[i];
    if (value <= hiThreshold) {
      const [loThreshold, loScore] = anchors[i - 1];
      const t = (value - loThreshold) / (hiThreshold - loThreshold);
      return Math.round((loScore + t * (hiScore - loScore)) * 10) / 10;
    }
  }

  // Unreachable — the two clamp checks above cover every value outside [first, last], and
  // the loop covers every value between two adjacent anchors.
  return anchors[anchors.length - 1][1];
}

/** Evidence-Before-Edit rate (0-1). Higher is better. */
export const EVIDENCE_DISCIPLINE_BANDS: readonly BandAnchor[] = [
  [0, 1],
  [0.2, 2],
  [0.35, 4],
  [0.5, 6],
  [0.65, 8],
  [0.8, 10],
];

/** Invalid Action rate (0-1), trailing window. Lower is better — score descends as it rises. */
export const EXECUTION_HYGIENE_BANDS: readonly BandAnchor[] = [
  [0, 10],
  [0.02, 10],
  [0.05, 8],
  [0.1, 6],
  [0.18, 4],
  [0.3, 2],
];

/**
 * Delta of steering_rate_event (recent - earlier), not the raw rate. Negative is better
 * (fewer interruptions needed over time).
 */
export const PROMPT_CRAFT_BANDS: readonly BandAnchor[] = [
  [-0.2, 10],
  [-0.05, 7],
  [0, 5],
  [0.05, 3],
  [0.2, 1],
];

/** The scored dimensions, in fixed display order — never sorted by score (no leaderboard, even within one card grid). */
export const SCORED_DIMENSIONS = ['evidence-discipline', 'prompt-craft', 'execution-hygiene'] as const;
export type ScoredDimensionId = (typeof SCORED_DIMENSIONS)[number];

const BANDS_BY_DIMENSION: Record<ScoredDimensionId, readonly BandAnchor[]> = {
  'evidence-discipline': EVIDENCE_DISCIPLINE_BANDS,
  'prompt-craft': PROMPT_CRAFT_BANDS,
  'execution-hygiene': EXECUTION_HYGIENE_BANDS,
};

/** Looks up the right band table by dimension id, so callers never have to know which table applies to which. */
export function scoreFor(dimensionId: ScoredDimensionId, value: number): number {
  return interpolateBand(value, BANDS_BY_DIMENSION[dimensionId]);
}

/** A locked dimension — mirrors the shape `step()` produces in plugin/lib/achievements.mjs. */
export type RubricProgress = { value: number; target: number; label: string; ratio: number };

/** The raw shape published by plugin/lib/rubric.mjs's evaluateRubric(). */
export type RubricSignal = {
  schema: number;
  qualifying_sessions: number;
  dimensions: {
    'evidence-discipline': { locked: true; progress: RubricProgress } | { locked: false; value: number; evidence: string };
    'prompt-craft': { locked: true; progress: RubricProgress } | { locked: false; value: number; evidence: string };
    'execution-hygiene': { locked: true; progress: RubricProgress } | { locked: false; value: number; evidence: string };
    'learning-velocity':
      | { locked: true; progress: RubricProgress }
      | {
          locked: false;
          direction: 'improved' | 'declined' | 'flat' | 'mixed';
          directions: Record<'evidence_before_edit' | 'invalid_action' | 'steering_rate_event', string | null>;
        };
  };
};
