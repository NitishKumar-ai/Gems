import React from 'react';

interface GemRoastProps {
  roastData: {
    roastText: string;
    model: string;
    rating: string;
    insights: string[];
  } | null;
  isLoading: boolean;
  error?: string;
}

export default function GemRoast({ roastData, isLoading, error }: GemRoastProps) {
  if (error) {
    return (
      <div className="w-full p-6 border border-red-900/50 rounded-xl bg-red-950/20 backdrop-blur-md">
        <div className="flex items-center space-x-3 mb-2">
          <span className="text-red-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
          <h3 className="text-red-400 font-semibold font-mono">Gem&apos;s Offline</h3>
        </div>
        <p className="text-red-300/80 text-sm font-mono">{error}</p>
      </div>
    );
  }

  if (isLoading || !roastData) {
    return (
      <div className="w-full p-6 border border-zinc-800 rounded-xl bg-zinc-900/30 backdrop-blur-md animate-pulse">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80"></div>
          <div className="space-y-2">
            <div className="w-32 h-4 bg-zinc-800/80 rounded"></div>
            <div className="w-20 h-3 bg-zinc-800/80 rounded"></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="w-full h-3 bg-zinc-800/60 rounded"></div>
          <div className="w-5/6 h-3 bg-zinc-800/60 rounded"></div>
          <div className="w-4/6 h-3 bg-zinc-800/60 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col border border-zinc-800 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl">
      <div className="px-6 py-4 bg-gradient-to-r from-indigo-950/40 to-purple-950/40 border-b border-zinc-800 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/20">
            G
          </div>
          <h3 className="text-zinc-200 font-semibold font-mono">Gem&apos;s Roast</h3>
        </div>
        <span className="px-3 py-1 text-xs font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50 rounded-full shadow-inner">
          {roastData.model}
        </span>
      </div>
      
      <div className="p-6 text-zinc-300 font-mono text-sm leading-relaxed">
        <p className="italic text-zinc-400 mb-6">&ldquo;{roastData.roastText}&rdquo;</p>
        
        <div className="mb-6 flex items-center space-x-2">
          <span className="text-zinc-500 uppercase tracking-widest text-xs">Vibe Rating:</span>
          <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            {roastData.rating}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 uppercase tracking-widest text-xs mb-3 block">Tech Insights:</span>
          <ul className="space-y-2">
            {roastData.insights.map((insight, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-indigo-400 mt-0.5">✦</span>
                <span className="text-zinc-300">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
