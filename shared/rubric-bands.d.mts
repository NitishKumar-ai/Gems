export declare const RUBRIC_BAND_VERSION: number;
export declare const RUBRIC_BANDS_PROVISIONAL: boolean;
export declare const RUBRIC_BAND_CALIBRATED_AT: string;

export type BandAnchor = readonly [threshold: number, score: number];

export declare function interpolateBand(value: number, anchors: readonly BandAnchor[]): number;

export declare const EVIDENCE_DISCIPLINE_BANDS: readonly BandAnchor[];
export declare const EXECUTION_HYGIENE_BANDS: readonly BandAnchor[];
export declare const PROMPT_CRAFT_BANDS: readonly BandAnchor[];
