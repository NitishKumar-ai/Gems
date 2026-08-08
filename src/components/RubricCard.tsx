import React from 'react';

import {
  RUBRIC_BAND_CALIBRATED_AT,
  RUBRIC_BANDS_PROVISIONAL,
  scoreFor,
  type RubricSignal,
} from '@/lib/rubric';

/**
 * Renders BELOW Achievements, not above it — a decision made during /plan-eng-review's
 * outside-voice pass, reversing this component's original above-the-fold placement.
 * A new builder's first impression should be the working evolution/achievements story,
 * not a mostly-locked, provisional rubric section.
 *
 * Every card mirrors Achievements.tsx's visual language on purpose: the basis-color chip
 * system (cyan=ratio, purple=trend), the opacity-60 + progress-bar locked pattern, and a
 * single shared <details> disclosure for the evidence trail — reused, not reinvented.
 */

const DIMENSION_LABEL: Record<string, string> = {
  'evidence-discipline': 'Evidence Discipline',
  'prompt-craft': 'Prompt Craft',
  'execution-hygiene': 'Execution Hygiene',
  'learning-velocity': 'Learning Velocity',
};

const DIMENSION_BASIS: Record<string, 'ratio' | 'trend'> = {
  'evidence-discipline': 'ratio',
  'prompt-craft': 'trend',
  'execution-hygiene': 'trend',
  'learning-velocity': 'trend',
};

const BASIS_CHIP: Record<'ratio' | 'trend', string> = {
  ratio: 'bg-cyan-950 text-cyan-300 border-cyan-800',
  trend: 'bg-purple-950 text-purple-300 border-purple-800',
};

const DIRECTION_HEADLINE: Record<string, string> = {
  improved: 'Improving',
  declined: 'Declining',
  flat: 'Holding steady',
  mixed: 'Mixed signal',
};

/** "evidence_before_edit" -> "Evidence Discipline", matching this card grid's own labels. */
const SIGNAL_LABEL: Record<string, string> = {
  evidence_before_edit: 'Evidence Discipline',
  invalid_action: 'Execution Hygiene',
  steering_rate_event: 'Prompt Craft',
};

/** Builds a plain-language sentence from Learning Velocity's per-signal directions. */
function describeDirections(directions: Record<string, string | null>): string {
  const byDirection: Record<string, string[]> = { improved: [], flat: [], declined: [] };
  for (const [signal, direction] of Object.entries(directions)) {
    if (direction && byDirection[direction]) byDirection[direction].push(SIGNAL_LABEL[signal] ?? signal);
  }

  const parts: string[] = [];
  if (byDirection.improved.length) parts.push(`improving on ${byDirection.improved.join(', ')}`);
  if (byDirection.flat.length) parts.push(`flat on ${byDirection.flat.join(', ')}`);
  if (byDirection.declined.length) parts.push(`declining on ${byDirection.declined.join(', ')}`);

  return parts.length ? `${parts.join('; ')}.` : '';
}

function ProvisionalChip() {
  if (!RUBRIC_BANDS_PROVISIONAL) return null;
  return (
    <span className="absolute top-3 right-3 px-2 py-0.5 rounded border border-dashed border-zinc-700 text-[9px] uppercase tracking-widest text-zinc-500">
      ○ provisional
    </span>
  );
}

function DimensionHeader({ id }: { id: string }) {
  const basis = DIMENSION_BASIS[id];
  return (
    <div className="flex items-start justify-between gap-3 pr-20">
      <span className="text-white font-semibold">{DIMENSION_LABEL[id]}</span>
      <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest ${BASIS_CHIP[basis]}`}>
        {basis}
      </span>
    </div>
  );
}

type Progress = { value: number; target: number; label: string; ratio: number };

function LockedCard({ id, progress }: { id: string; progress: Progress }) {
  const filled = Math.round(progress.ratio * 100);

  return (
    <li className="border border-zinc-900 rounded-lg p-5 flex flex-col gap-3 opacity-60 list-none">
      <div className="flex items-start justify-between gap-3">
        <span className="text-zinc-400 font-semibold">{DIMENSION_LABEL[id]}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-600">{DIMENSION_BASIS[id]}</span>
      </div>
      <div className="space-y-1.5">
        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={progress.target}>
          <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${filled}%` }} />
        </div>
        <p className="text-xs text-zinc-500 font-mono">
          {progress.value}/{progress.target} {progress.label}
        </p>
      </div>
    </li>
  );
}

function ScoredCard({ id, value, evidence }: { id: 'evidence-discipline' | 'prompt-craft' | 'execution-hygiene'; value: number; evidence: string }) {
  const score = scoreFor(id, value);

  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3 relative list-none">
      <ProvisionalChip />
      <DimensionHeader id={id} />
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-white">{score.toFixed(1)}</span>
        <span className="text-sm text-zinc-500">/ 10</span>
      </div>
      <p className="text-xs text-zinc-500 font-mono">{evidence}</p>
    </li>
  );
}

function LearningVelocityCard({
  direction,
  directions,
}: {
  direction: 'improved' | 'declined' | 'flat' | 'mixed';
  directions: Record<string, string | null>;
}) {
  const description = describeDirections(directions);

  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3 relative list-none">
      <ProvisionalChip />
      <DimensionHeader id="learning-velocity" />
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-zinc-400">{DIRECTION_HEADLINE[direction]}</span>
      </div>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
    </li>
  );
}

function bandsAsOf(): string {
  const date = new Date(RUBRIC_BAND_CALIBRATED_AT);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

const EVIDENCE_TRAIL_LINE: Record<string, (d: RubricSignal['dimensions'][keyof RubricSignal['dimensions']]) => string> = {
  'evidence-discipline': (d) => (d.locked ? `evidence_before_edit: locked (${d.progress.value}/${d.progress.target} ${d.progress.label})` : `evidence_before_edit: ${(d as { evidence: string }).evidence}`),
  'prompt-craft': (d) => (d.locked ? `steering_rate_event: locked (${d.progress.value}/${d.progress.target} ${d.progress.label})` : `steering_rate_event: ${(d as { evidence: string }).evidence}`),
  'execution-hygiene': (d) => (d.locked ? `invalid_action_rate: locked (${d.progress.value}/${d.progress.target} ${d.progress.label})` : `invalid_action_rate: ${(d as { evidence: string }).evidence}`),
};

export default function RubricCard({ data }: { data: RubricSignal | null }) {
  // A profile published before this feature shipped has no rubric block at all — same
  // contract as Achievements: say nothing rather than render an empty or fabricated section.
  if (!data) return null;

  const { dimensions } = data;
  const scoredIds = ['evidence-discipline', 'prompt-craft', 'execution-hygiene'] as const;
  const lockedCount = scoredIds.filter((id) => dimensions[id].locked).length + (dimensions['learning-velocity'].locked ? 1 : 0);
  const scoredCount = 4 - lockedCount;

  return (
    <section className="space-y-4">
      <h3 className="text-xl font-semibold flex items-center space-x-2">
        <span className="text-cyan-400">◈</span>
        <span>Builder Rubric</span>
      </h3>
      <p className="text-zinc-400 text-sm">
        Four scores, each backed by the session data that produced it — click any card to verify the receipts yourself.
      </p>
      <p className="text-sm text-zinc-300 font-semibold">
        {scoredCount} of 4 scored{lockedCount > 0 ? ` · ${lockedCount} locked` : ''}
      </p>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {scoredIds.map((id) => {
          const dim = dimensions[id];
          return dim.locked ? (
            <LockedCard key={id} id={id} progress={dim.progress} />
          ) : (
            <ScoredCard key={id} id={id} value={dim.value} evidence={dim.evidence} />
          );
        })}
        {dimensions['learning-velocity'].locked ? (
          <LockedCard id="learning-velocity" progress={dimensions['learning-velocity'].progress} />
        ) : (
          <LearningVelocityCard
            direction={dimensions['learning-velocity'].direction}
            directions={dimensions['learning-velocity'].directions}
          />
        )}
      </ul>

      <details className="mt-2 group">
        <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 transition-colors select-none">
          View evidence trail
        </summary>
        <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg p-5 font-mono text-xs text-zinc-400 space-y-1">
          {scoredIds.map((id) => (
            <p key={id}>{EVIDENCE_TRAIL_LINE[id](dimensions[id])}</p>
          ))}
        </div>
      </details>

      <p className="text-[11px] text-zinc-600 mt-2">Bands as of {bandsAsOf()}</p>
    </section>
  );
}
