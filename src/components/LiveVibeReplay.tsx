'use client';

import React, { useState, useEffect } from 'react';

export type ToolEvent = {
  id: string;
  name: string;
  model: string;
  timestamp: string;
};

interface LiveVibeReplayProps {
  events: ToolEvent[];
}

export default function LiveVibeReplay({ events }: LiveVibeReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;

    // 2.5 seconds per commit for the "vibe"
    const timer = setTimeout(() => {
      if (currentIndex >= events.length - 1) {
        setIsPlaying(false);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, events.length]);

  const togglePlay = () => {
    // Replaying after the journey has finished restarts from the first event
    if (!isPlaying && currentIndex >= events.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };
  
  if (!events || events.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center border border-zinc-800 rounded-xl bg-black/40 backdrop-blur-md">
        <p className="text-zinc-500 font-mono text-sm">Waiting for vibe coding data...</p>
      </div>
    );
  }

  const currentEvent = events[currentIndex];

  return (
    <div className="w-full flex flex-col border border-zinc-800 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl transition-all duration-300">
      {/* Header bar */}
      <div className="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <span className="text-zinc-400 text-xs font-mono tracking-widest uppercase ml-2">Live Vibe Replay</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="px-2.5 py-1 text-[10px] font-mono bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 rounded-full">
            {currentEvent.model}
          </span>
          <button 
            onClick={togglePlay}
            className="text-zinc-400 hover:text-white transition-colors focus:outline-none"
            title={isPlaying ? "Pause replay" : "Play replay"}
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Event Info */}
      <div className="px-4 py-3 bg-zinc-900/40 border-b border-zinc-800 flex justify-between items-center text-sm">
        <div className="font-mono text-zinc-300">
          <span className="text-purple-400">{currentEvent.id.substring(0, 7)}</span> 
          <span className="mx-2 text-zinc-600">|</span>
          <span className="text-zinc-200">Executing <span className="text-cyan-400">{currentEvent.name}</span></span>
        </div>
        <div className="text-zinc-500 font-mono text-xs">
          {currentIndex + 1} / {events.length}
        </div>
      </div>

      {/* Code Viewer (Mocked Tool Execution) */}
      <div className="relative w-full min-h-[180px] max-h-[400px] overflow-auto bg-[#0d1117] p-6 font-mono text-sm leading-relaxed flex flex-col items-center justify-center">
        <div className="text-zinc-500 mb-4 animate-pulse">Running tool</div>
        <div className="px-4 py-2 bg-zinc-800 rounded-md text-zinc-300 border border-zinc-700 shadow-inner">
          {currentEvent.name}
        </div>
        <div className="mt-6 text-xs text-zinc-600">
          Timestamp: {new Date(currentEvent.timestamp).toLocaleTimeString()}
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-1 bg-zinc-800">
        <div 
          className="h-full bg-cyan-500 transition-all duration-500 ease-out"
          style={{ width: `${((currentIndex + 1) / events.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
