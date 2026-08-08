'use client';

import React, { useEffect, useState } from 'react';
import { SCORED_DIMENSIONS, scoreFor, type ScoredDimensionId } from '@/lib/rubric';
import type { Achievement } from '@/components/Achievements';
import type { JourneyMetrics } from '@/services/llm';

/**
 * A Wrapped-style animated reveal built around the Anthropic-generated builder report
 * (src/services/llm.ts's AnalysisResult). Modeled directly on LiveVibeReplay's auto-advance
 * pattern — same useState/useEffect/setTimeout shape, same progress-bar markup — rather than
 * pulling in a new animation dependency.
 *
 * `data` is `null` whenever no analysis exists yet (no ANTHROPIC_API_KEY at publish time, the
 * call failed, or the profile predates this feature). Renders nothing in that case — the same
 * "say nothing rather than fabricate" contract Achievements and RubricCard already follow.
 */

type AnalysisResult = {
  schema: 1;
  generated_at: string;
  model: string;
  archetype: { name: string; rationale: string };
  headline: string;
  summary: string;
  insights: { label: string; detail: string }[];
  growth_edge: { title: string; detail: string };
};

const DIMENSION_LABEL: Record<ScoredDimensionId, string> = {
  'evidence-discipline': 'Evidence Discipline',
  'prompt-craft': 'Prompt Craft',
  'execution-hygiene': 'Execution Hygiene',
};

type Card = { key: string; render: () => React.ReactNode };

function ArchetypeCard({ archetype }: { archetype: AnalysisResult['archetype'] }) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-8 py-16 space-y-6">
      <span className="text-xs uppercase tracking-widest text-zinc-500">Your Builder Archetype</span>
      <h2 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-300">
        {archetype.name}
      </h2>
      <p className="text-zinc-400 max-w-md">{archetype.rationale}</p>
    </div>
  );
}

function StatsCard({ headline, stats }: { headline: string; stats: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col justify-center h-full px-8 py-16 space-y-8">
      <h3 className="text-2xl md:text-3xl font-semibold text-white text-center">{headline}</h3>
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementCard({ badge }: { badge: Achievement }) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-8 py-16 space-y-4">
      <span className="text-xs uppercase tracking-widest text-amber-500">Achievement Unlocked</span>
      <div className="text-2xl font-bold text-white">{badge.title}</div>
      <p className="text-zinc-400 max-w-md">{badge.description}</p>
      {badge.evidence && <p className="text-xs text-zinc-600 font-mono">{badge.evidence}</p>}
    </div>
  );
}

function RubricHighlightCard({
  dimensionId,
  score,
  evidence,
  insight,
}: {
  dimensionId: ScoredDimensionId;
  score: number;
  evidence: string;
  insight?: { label: string; detail: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-8 py-16 space-y-4">
      <span className="text-xs uppercase tracking-widest text-cyan-500">{DIMENSION_LABEL[dimensionId]}</span>
      <div className="text-5xl font-bold text-white">
        {score.toFixed(1)}
        <span className="text-lg text-zinc-500"> / 10</span>
      </div>
      <p className="text-xs text-zinc-600 font-mono">{evidence}</p>
      {insight && (
        <p className="text-zinc-400 max-w-md mt-2">
          <span className="text-zinc-300 font-semibold">{insight.label}:</span> {insight.detail}
        </p>
      )}
    </div>
  );
}

function GrowthEdgeCard({ growthEdge, onShare, copied }: { growthEdge: AnalysisResult['growth_edge']; onShare: () => void; copied: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-8 py-16 space-y-6">
      <span className="text-xs uppercase tracking-widest text-purple-400">Your Growth Edge</span>
      <h3 className="text-2xl md:text-3xl font-semibold text-white max-w-md">{growthEdge.title}</h3>
      <p className="text-zinc-400 max-w-md">{growthEdge.detail}</p>
      <button
        onClick={onShare}
        className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full text-sm text-zinc-200 transition-colors"
      >
        {copied ? 'Link copied' : 'Share this report'}
      </button>
    </div>
  );
}

export default function BuilderReveal({
  data,
  metrics,
}: {
  data: AnalysisResult | null;
  metrics: JourneyMetrics | null | undefined;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);

  const cards: Card[] = [];

  if (data) {
    cards.push({ key: 'archetype', render: () => <ArchetypeCard archetype={data.archetype} /> });

    const rates = metrics?.totals?.rates ?? {};
    const percent = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : 'N/A');
    cards.push({
      key: 'stats',
      render: () => (
        <StatsCard
          headline={data.headline}
          stats={[
            { label: 'Sessions', value: String(metrics?.totals?.sessions ?? 0) },
            { label: 'Edits', value: String(metrics?.totals?.edits ?? 0) },
            { label: 'Evidence Before Edit', value: percent(rates.evidence_before_edit) },
          ]}
        />
      ),
    });

    const earned: Achievement[] = metrics?.achievements?.earned ?? [];
    if (earned.length > 0) {
      const latest = earned[earned.length - 1];
      cards.push({ key: 'achievement', render: () => <AchievementCard badge={latest} /> });
    }

    const dimensions = metrics?.rubric?.dimensions ?? {};
    const scoredId = SCORED_DIMENSIONS.find((id) => dimensions[id] && !dimensions[id].locked);
    if (scoredId) {
      const dim = dimensions[scoredId];
      cards.push({
        key: 'rubric',
        render: () => (
          <RubricHighlightCard
            dimensionId={scoredId}
            score={scoreFor(scoredId, dim.value ?? 0)}
            evidence={dim.evidence ?? ''}
            insight={data.insights?.[0]}
          />
        ),
      });
    }

    cards.push({
      key: 'growth-edge',
      render: () => (
        <GrowthEdgeCard
          growthEdge={data.growth_edge}
          copied={copied}
          onShare={() => {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        />
      ),
    });
  }

  useEffect(() => {
    if (!isPlaying || cards.length === 0) return;

    const timer = setTimeout(() => {
      if (currentIndex >= cards.length - 1) {
        setIsPlaying(false);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, cards.length]);

  if (!data || cards.length === 0) return null;

  const togglePlay = () => {
    if (!isPlaying && currentIndex >= cards.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const goTo = (index: number) => {
    setIsPlaying(false);
    setCurrentIndex(Math.max(0, Math.min(cards.length - 1, index)));
  };

  return (
    <div className="w-full flex flex-col border border-zinc-800 rounded-xl overflow-hidden bg-gradient-to-b from-zinc-950 to-black shadow-2xl">
      <div className="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-zinc-400 text-xs font-mono tracking-widest uppercase">Builder Report</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            aria-label="Previous card"
          >
            ‹
          </button>
          <button onClick={togglePlay} className="text-zinc-400 hover:text-white transition-colors" aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === cards.length - 1}
            className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            aria-label="Next card"
          >
            ›
          </button>
        </div>
      </div>

      <div className="min-h-[320px] transition-opacity duration-300">{cards[currentIndex].render()}</div>

      <div className="flex gap-1.5 px-4 pb-4">
        {cards.map((c, i) => (
          <div key={c.key} className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-500 ease-out"
              style={{ width: i <= currentIndex ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
