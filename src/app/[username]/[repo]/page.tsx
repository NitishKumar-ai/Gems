import React from 'react';
import LiveVibeReplay, { CommitDiff } from '@/components/LiveVibeReplay';
import GemRoast from '@/components/GemRoast';

// Next.js App Router ISR: Revalidate this page every 60 seconds
export const revalidate = 60;

// Mock data generation function (since we aren't calling real APIs for MVP)
async function getRepoData(username: string, repo: string) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const mockCommits: CommitDiff[] = [
    {
      id: 'f3a4b92',
      message: 'Initial prompt: Create a modern landing page for a web3 startup',
      model: 'GPT-4o',
      diffText: '+ import React from "react";\n+ export default function Landing() {\n+   return <div className="text-white bg-black">Welcome</div>;\n+ }',
      timestamp: new Date().toISOString()
    },
    {
      id: 'c7d8e9f',
      message: 'Refine: Make it more vibrant, add neon accents and gradients',
      model: 'Claude 3.5 Sonnet',
      diffText: '-   return <div className="text-white bg-black">Welcome</div>;\n+   return <div className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-600">Welcome to Web3</div>;',
      timestamp: new Date().toISOString()
    },
    {
      id: '1a2b3c4',
      message: 'Debug: Fix hydration error in React 18',
      model: 'GPT-4o',
      diffText: '+   const [mounted, setMounted] = useState(false);\n+   useEffect(() => setMounted(true), []);\n+   if (!mounted) return null;',
      timestamp: new Date().toISOString()
    }
  ];

  const mockRoast = {
    roastText: `Oh honey, a 'web3 startup' landing page? Groundbreaking. The gradients are cute, but the fact that you needed Claude to tell you how to add a CSS class is giving 'I just learned HTML yesterday' energy. At least you fixed the hydration error—eventually.`,
    model: 'Gem (Claude 3.5 Opus)',
    rating: '6.5/10 - Basic Vibe',
    insights: [
      'Good catch on the React 18 hydration fix. Using useEffect to set mounted state is the standard Next.js workaround.',
      'Tailwind gradients (bg-clip-text) are performance-heavy if overused. Ensure they are only on headings.',
      'Consider using next/dynamic for client-only components instead of the mounted state hack.'
    ]
  };

  return { commits: mockCommits, roast: mockRoast, modelsUsed: ['GPT-4o', 'Claude 3.5 Sonnet'] };
}

export default async function PortfolioPage({ params }: { params: Promise<{ username: string, repo: string }> }) {
  const { username, repo } = await params;
  
  // T5: ISR is enabled via `export const revalidate = 60` above.
  // In a real app, this would fetch from Supabase.
  const { commits, roast, modelsUsed } = await getRepoData(username, repo);

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-12 mt-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-8 space-y-4 md:space-y-0">
          <div>
            <h2 className="text-zinc-500 mb-1 flex items-center space-x-2">
              <a href={`https://github.com/${username}`} className="hover:text-zinc-300 transition-colors">@{username}</a>
              <span>/</span>
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
          {/* Left Column: Replay */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-semibold flex items-center space-x-2">
              <span className="text-cyan-400">⚡</span>
              <span>The Vibe Journey</span>
            </h3>
            <p className="text-zinc-400 text-sm">Watch exactly how human intelligence collaborated with AI to build this project.</p>
            <LiveVibeReplay commits={commits} />
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
