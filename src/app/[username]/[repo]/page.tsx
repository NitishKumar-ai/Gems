import React from 'react';
import { notFound } from 'next/navigation';
import Achievements from '@/components/Achievements';
import RubricCard from '@/components/RubricCard';
import prisma from '@/lib/prisma';

// Revalidate this page every 60 seconds
export const revalidate = 60;

async function getRepoData(username: string, repo: string) {
  const journey = await prisma.journey.findUnique({
    where: {
      username_repo: {
        username,
        repo,
      },
    },
  });

  if (!journey) {
    return null;
  }

  const metrics = JSON.parse(journey.metrics);

  return { metrics, modelsUsed: Object.keys(metrics.totals?.models || {}) };
}

export default async function PortfolioPage({ params }: { params: Promise<{ username: string, repo: string }> }) {
  const { username, repo } = await params;
  
  const data = await getRepoData(username, repo);
  if (!data) {
    notFound();
  }

  const { metrics, modelsUsed } = data;
  const rates = metrics.totals?.rates || {};

  // A rate is deliberately `null` when there was no denominator to divide by — a session with no
  // edits has no evidence-before-edit rate, and 0% would read as editing blind every time. It can
  // also be absent entirely: /api/publish stores whatever JSON it is handed, so an older or
  // partial artifact reaches this page with `rates` half-filled. Checking `!== null` alone let
  // `undefined` through to `.toFixed()`, which threw and took the whole profile down with a 500.
  const percent = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A';

  const ebe = percent(rates.evidence_before_edit);
  const iar = percent(rates.invalid_action);

  const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const signedClass = (value: number, betterWhen: 'up' | 'down') =>
    (betterWhen === 'up' ? value > 0 : value < 0) ? 'text-green-400' : 'text-red-400';

  // A delta is absent whenever a window had no denominator, and the whole `delta` object is
  // absent on a partial artifact. Rows are built from what is actually present so a missing
  // number is a missing row rather than a crash.
  const delta = metrics.trend?.delta ?? {};
  const deltaRows: { label: string; value: unknown; betterWhen: 'up' | 'down' }[] = [
    { label: 'Evidence-Before-Edit', value: delta.evidence_before_edit, betterWhen: 'up' },
    { label: 'Invalid Action Rate', value: delta.invalid_action, betterWhen: 'down' },
  ];
  const deltas = deltaRows.flatMap(({ label, value, betterWhen }) =>
    isNumber(value) ? [{ label, value, betterWhen }] : [],
  );

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-12 mt-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-8 space-y-4 md:space-y-0">
          <div>
            <h2 className="text-zinc-500 mb-1 flex items-center space-x-2">
              <a href={`https://github.com/${username}`} className="hover:text-zinc-300 transition-colors">@{username}</a>
            </h2>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">{repo}</h1>
          </div>
          
          {/* T7: Paxcel Style Model Tags */}
          <div className="flex flex-col items-start md:items-end space-y-2">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Built With</span>
            <div className="flex gap-2 flex-wrap">
              {modelsUsed.map(model => (
                <span key={model} className="px-3 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-300 shadow-sm">
                  {model}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* One column, not two. The right-hand column held the roast, which was canned text and an
            invented model name sitting beside a real person's published numbers — the same reason
            LiveVibeReplay was unmounted in Phase 4. It comes back when it has something real to
            say; until then the measurements are the page. */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center space-x-2">
            <span className="text-cyan-400">⚡</span>
            <span>The Vibe Journey</span>
          </h3>
          <p className="text-zinc-400 text-sm">Real metrics extracted from Claude Code sessions.</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <div className="text-3xl font-bold text-white mb-2">{metrics.totals?.sessions || 0}</div>
              <div className="text-sm text-zinc-400 uppercase tracking-wider">Sessions</div>
            </div>
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <div className="text-3xl font-bold text-white mb-2">{metrics.totals?.edits || 0}</div>
              <div className="text-sm text-zinc-400 uppercase tracking-wider">Total Edits</div>
            </div>
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <div className="text-3xl font-bold text-white mb-2">{ebe}</div>
              <div className="text-sm text-zinc-400 uppercase tracking-wider">Evidence Before Edit</div>
            </div>
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <div className="text-3xl font-bold text-white mb-2">{iar}</div>
              <div className="text-sm text-zinc-400 uppercase tracking-wider">Invalid Action Rate</div>
            </div>
          </div>

          {deltas.length > 0 && (
            <div className="mt-8 bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <h4 className="text-lg font-semibold mb-4 border-b border-zinc-800 pb-2 text-zinc-200">Evolution</h4>
              <div className="space-y-2 text-zinc-300">
                {deltas.map(({ label, value, betterWhen }) => (
                  <div key={label} className="flex justify-between">
                    <span>{label}:</span>
                    {/* The sign follows the metric, never a notion of "good": rising
                        evidence-before-edit is an improvement, rising invalid-action is not. */}
                    <span className={signedClass(value, betterWhen)}>{signedPercent(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Achievements data={metrics.achievements ?? null} />

        {/* Below Achievements, not above — reversed from the original above-the-fold design
            during /plan-eng-review's outside-voice pass, to protect the working evolution/
            achievements story from a mostly-locked, provisional section on a new profile. */}
        <RubricCard data={metrics.rubric ?? null} />
      </div>
    </main>
  );
}
