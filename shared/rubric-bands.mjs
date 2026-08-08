// Shared rubric bands for both plugin and app

export const RUBRIC_BAND_VERSION = 1;

export const RUBRIC_BANDS_PROVISIONAL = true;
export const RUBRIC_BAND_CALIBRATED_AT = '2026-08-08';

export function interpolateBand(value, anchors) {
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

  return anchors[anchors.length - 1][1];
}

export const EVIDENCE_DISCIPLINE_BANDS = [
  [0, 1],
  [0.2, 2],
  [0.35, 4],
  [0.5, 6],
  [0.65, 8],
  [0.8, 10],
];

export const EXECUTION_HYGIENE_BANDS = [
  [0, 10],
  [0.02, 10],
  [0.05, 8],
  [0.1, 6],
  [0.18, 4],
  [0.3, 2],
];

export const PROMPT_CRAFT_BANDS = [
  [-0.2, 10],
  [-0.05, 7],
  [0, 5],
  [0.05, 3],
  [0.2, 1],
];
