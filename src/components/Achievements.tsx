import React from 'react';

/**
 * Phase 5 badges, rendered from the published journey artifact.
 *
 * The profile shows what each badge is derived from, not just that it was won. A milestone
 * and a two-month consistency record are both a row with a trophy on it otherwise, and the
 * whole claim of this project is that the numbers behind a profile can be inspected.
 */

export type Achievement = {
  id: string;
  title: string;
  description: string;
  basis: 'milestone' | 'ratio' | 'consistency' | 'trend';
  earned_at: string | null;
  evidence?: string;
  revocable?: boolean;
  progress?: { value: number; target: number; label: string; ratio: number };
};

export type AchievementsData = {
  earned: Achievement[];
  locked: Achievement[];
  qualifying_sessions: number;
  ignored_sessions: number;
};

const BASIS_STYLE: Record<Achievement['basis'], { chip: string; note: string }> = {
  milestone: { chip: 'bg-zinc-800 text-zinc-300 border-zinc-700', note: 'a first, and cheap to earn' },
  ratio: { chip: 'bg-cyan-950 text-cyan-300 border-cyan-800', note: 'a rate held over real volume' },
  consistency: { chip: 'bg-amber-950 text-amber-300 border-amber-800', note: 'measured in calendar days' },
  trend: { chip: 'bg-purple-950 text-purple-300 border-purple-800', note: 'direction of travel' },
};

function EarnedBadge({ badge }: { badge: Achievement }) {
  const style = BASIS_STYLE[badge.basis] ?? BASIS_STYLE.milestone;

  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-white font-semibold">{badge.title}</span>
        <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest ${style.chip}`}>
          {badge.basis}
        </span>
      </div>

      <p className="text-sm text-zinc-400 leading-relaxed">{badge.description}</p>

      {badge.evidence && (
        <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-3 font-mono">
          {badge.evidence}
          {badge.earned_at && <span className="text-zinc-600"> · {badge.earned_at.slice(0, 10)}</span>}
        </p>
      )}

      {/* Every other badge is a fact about the past. This one is a claim about the present,
          and saying so is cheaper than having someone notice it disappeared. */}
      {badge.revocable && (
        <p className="text-[11px] text-purple-400/80">Held while the trend holds — this one can lapse.</p>
      )}
    </li>
  );
}

function LockedBadge({ badge }: { badge: Achievement }) {
  const progress = badge.progress;
  const filled = Math.round((progress?.ratio ?? 0) * 100);

  return (
    <li className="border border-zinc-900 rounded-lg p-5 flex flex-col gap-3 opacity-60">
      <div className="flex items-start justify-between gap-3">
        <span className="text-zinc-400 font-semibold">{badge.title}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-600">{badge.basis}</span>
      </div>

      <p className="text-sm text-zinc-500 leading-relaxed">{badge.description}</p>

      {progress && (
        <div className="space-y-1.5">
          <div className="h-1 bg-zinc-900 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={progress.target}>
            <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${filled}%` }} />
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            {progress.value}/{progress.target} {progress.label}
          </p>
        </div>
      )}
    </li>
  );
}

export default function Achievements({ data }: { data: AchievementsData | null }) {
  // A profile published before Phase 5 has no achievements block. Saying nothing is better
  // than rendering an empty trophy case that reads as "earned none of them".
  if (!data) return null;

  const { earned = [], locked = [], qualifying_sessions: qualifying = 0, ignored_sessions: ignored = 0 } = data;

  return (
    <section className="space-y-4">
      <h3 className="text-xl font-semibold flex items-center space-x-2">
        <span className="text-amber-400">🏆</span>
        <span>Achievements</span>
      </h3>
      <p className="text-zinc-400 text-sm">
        Derived from {qualifying} session{qualifying === 1 ? '' : 's'} with real work in them
        {ignored > 0 && <span className="text-zinc-500"> · {ignored} too thin to count</span>}. Every badge names
        the numbers that earned it.
      </p>

      {earned.length > 0 ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {earned.map((badge) => (
            <EarnedBadge key={badge.id} badge={badge} />
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          Nothing earned yet. Badges come from sessions with real work in them, so an empty run does not count
          toward one.
        </p>
      )}

      {locked.length > 0 && (
        <details className="mt-6 group">
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 transition-colors select-none">
            {locked.length} still locked
          </summary>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {locked.map((badge) => (
              <LockedBadge key={badge.id} badge={badge} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
