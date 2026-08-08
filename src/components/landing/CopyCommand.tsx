'use client';

import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-stretch gap-0 w-full max-w-lg">
      <code className="flex-1 font-mono text-sm bg-ink text-cream px-4 py-3 rounded-l-md overflow-x-auto">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 bg-primary hover:bg-primary-deep text-on-primary font-medium text-sm px-4 rounded-r-md transition-colors"
        aria-label={`Copy command: ${command}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
