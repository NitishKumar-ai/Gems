// Gems — rubric band interpolation (app side).
//
// interpolateBand() and the band tables live in shared/rubric-bands.mjs, imported here and
// re-exported — this file no longer duplicates them. Both plugin/lib/rubric.mjs's consumers
// and this app read the same tables, so a band recalibration can't leave the CLI preview and
// the published page disagreeing.
//
// Why this file exists at all rather than reusing a pre-computed score: buildJourney()
// (plugin/lib/journey.mjs) is the only place with access to raw session data, so it freezes
// the RAW signal (a rate or a delta) into the published blob at publish time. Turning that
// raw signal into a 0-10 score is this file's job, done live at render time — so a later
// band recalibration (bumping RUBRIC_BAND_VERSION below) changes what a published profile
// displays without anyone needing to republish.

import {
  RUBRIC_BAND_VERSION,
  RUBRIC_BANDS_PROVISIONAL,
  RUBRIC_BAND_CALIBRATED_AT,
  interpolateBand,
  EVIDENCE_DISCIPLINE_BANDS,
  EXECUTION_HYGIENE_BANDS,
  PROMPT_CRAFT_BANDS,
  type BandAnchor,
} from '../../shared/rubric-bands.mjs';

export {
  RUBRIC_BAND_VERSION,
  RUBRIC_BANDS_PROVISIONAL,
  RUBRIC_BAND_CALIBRATED_AT,
  interpolateBand,
  EVIDENCE_DISCIPLINE_BANDS,
  EXECUTION_HYGIENE_BANDS,
  PROMPT_CRAFT_BANDS,
  type BandAnchor,
};

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
