'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import repository');
      }

      // Redirect to the dynamic portfolio page
      router.push(\`/\${data.data.owner}/\${data.data.repo}\`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-black text-zinc-100 font-mono">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-black to-purple-900/20 pointer-events-none"></div>

      <div className="z-10 w-full max-w-xl flex flex-col items-center space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500">
            VibeCoder
          </h1>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mx-auto">
            Drop your AI-generated GitHub repo to create a dynamic portfolio and get roasted by Gem.
          </p>
        </div>

        <form onSubmit={handleImport} className="w-full space-y-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl shadow-2xl">
          <div className="space-y-2">
            <label htmlFor="repoUrl" className="text-xs text-zinc-500 uppercase tracking-widest">
              GitHub Repository URL
            </label>
            <input
              id="repoUrl"
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repo"
              className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              required
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950/30 px-3 py-2 rounded border border-red-900/50">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-4 rounded-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center space-x-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Analyzing Vibes...</span>
              </>
            ) : (
              <span>Generate Portfolio</span>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
