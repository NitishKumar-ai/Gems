import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Receives a derived journey artifact from `/gems publish` and stores it for the profile page.
 *
 * The API key identifies who is publishing. `username` says where it lands, and it arrives in the
 * request body — so the two have to be reconciled before anything is written. Without that check
 * the upsert below reassigns `userId` on an existing row, which means any valid key could
 * overwrite someone else's public profile and take ownership of it in the same call.
 *
 * Still open: nothing stops a caller claiming a username nobody has published under yet. Closing
 * that needs the GitHub login bound to the account at sign-in — tracked as P0 in TODOS.md.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.split(' ')[1];
    // An empty or whitespace key must never be looked up: `findUnique` on a null-ish value can
    // match a user row whose apiKey was never generated.
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { apiKey } });

    if (!user) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const data = await request.json();
    const { username, repo, metrics } = data;

    if (!username || !repo || !metrics) {
      return NextResponse.json({ error: 'Missing required fields: username, repo, metrics' }, { status: 400 });
    }

    const existing = await prisma.journey.findUnique({
      where: { username_repo: { username, repo } },
      select: { userId: true },
    });

    if (existing && existing.userId !== user.id) {
      // Deliberately does not say whether the journey exists — that would turn this endpoint
      // into a way to enumerate who has published what.
      return NextResponse.json({ error: 'You do not own this profile' }, { status: 403 });
    }

    await prisma.journey.upsert({
      where: { username_repo: { username, repo } },
      update: { metrics: JSON.stringify(metrics) },
      create: {
        userId: user.id,
        username,
        repo,
        metrics: JSON.stringify(metrics),
      },
    });

    return NextResponse.json({ success: true, url: `/${username}/${repo}` });
  } catch (error: unknown) {
    console.error('Failed to publish journey:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
