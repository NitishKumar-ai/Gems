import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { repoUrl } = await request.json();

    if (!repoUrl || typeof repoUrl !== 'string') {
      return NextResponse.json({ error: 'Valid repository URL is required' }, { status: 400 });
    }

    // Basic validation for GitHub URLs
    const urlPattern = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/;
    const match = repoUrl.match(urlPattern);

    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL format' }, { status: 400 });
    }

    const [, owner, repo] = match;

    // TODO: Phase 3 (T3) - Push this repository data to Upstash QStash 
    // for asynchronous processing and LLM "Gem" roasts.

    return NextResponse.json({ 
      success: true, 
      message: 'Repository queued for processing.',
      data: {
        owner,
        repo
      }
    });
  } catch (error) {
    console.error('Error importing repo:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
