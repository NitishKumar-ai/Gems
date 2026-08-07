import React from 'react';
import { notFound } from 'next/navigation';
import GemRoast from '@/components/GemRoast';
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



  const mockRoast = {
    roastText: `Oh honey, look at all these tool failures. Maybe read the docs before making Claude write blindly? At least your evidence-before-edit rate is somewhat acceptable.`,
    model: 'Gem (Claude 3.5 Opus)',
    rating: '7/10 - Getting there',
    insights: [
      'Try running tests more frequently.',
      'You are relying heavily on Claude for simple edits.'
    ]
  };

  return { metrics, roast: mockRoast, modelsUsed: Object.keys(metrics.totals?.models || {}) };
}

export default async function PortfolioPage({ params }: { params: Promise<{ username: string, repo: string }> }) {
  const { username, repo } = await params;
  
  const data = await getRepoData(username, repo);
  if (!data) {
    notFound();
  }

  const { metrics, roast, modelsUsed } = data;
  const rates = metrics.totals?.rates || {};
  const ebe = rates.evidence_before_edit !== null ? (rates.evidence_before_edit * 100).toFixed(1) + '%' : 'N/A';
  const iar = rates.invalid_action !== null ? (rates.invalid_action * 100).toFixed(1) + '%' : 'N/A';
  const tpp = rates.turns_per_prompt !== null ? rates.turns_per_prompt.toFixed(1) : 'N/A';

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-semibold flex items-center space-x-2">
              <span className="text-cyan-400">⚡</span>
              <span>The Vibe Journey</span>
            </h3>
            <p className="text-zinc-400 text-sm">Real metrics extracted from Claude Code sessions.</p>
            
            <div className="grid grid-cols-2 gap-4 mt-6">
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
            
            {metrics.trend && (
              <div className="mt-8 bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                <h4 className="text-lg font-semibold mb-4 border-b border-zinc-800 pb-2 text-zinc-200">Evolution</h4>
                <div className="space-y-2 text-zinc-300">
                  <div className="flex justify-between">
                    <span>Evidence-Before-Edit:</span>
                    <span className={metrics.trend.delta.evidence_before_edit > 0 ? 'text-green-400' : 'text-red-400'}>
                      {metrics.trend.delta.evidence_before_edit !== null ? (metrics.trend.delta.evidence_before_edit > 0 ? '+' : '') + (metrics.trend.delta.evidence_before_edit * 100).toFixed(1) + '%' : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Invalid Action Rate:</span>
                    <span className={metrics.trend.delta.invalid_action < 0 ? 'text-green-400' : 'text-red-400'}>
                      {metrics.trend.delta.invalid_action !== null ? (metrics.trend.delta.invalid_action > 0 ? '+' : '') + (metrics.trend.delta.invalid_action * 100).toFixed(1) + '%' : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Roast */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold flex items-center space-x-2">
              <span className="text-purple-500">🔥</span>
              <span>Gem&apos;s Verdict</span>
            </h3>
            <p className="text-zinc-400 text-sm">Learning through playful critique.</p>
            <GemRoast roastData={roast} isLoading={false} />
          </div>
        </div>
      </div>
    </main>
  );
}
