import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Receives a derived journey artifact from `/gems publish` and stores it for the profile page.
 *
 * The API key identifies who is publishing, and the profile it lands on is derived from that key
 * alone: `username` is the GitHub handle bound to the account at sign-in, never a value the
 * caller supplies. Trusting the body meant nothing stopped a signed-in stranger publishing to
 * `/torvalds/linux` — a username nobody had claimed yet passed every check, because the only
 * check was against usernames already taken.
 *
 * A body `username` is still accepted, and still has to match, so an out-of-date client gets a
 * 403 explaining the mismatch rather than silently publishing somewhere it did not expect.
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
    const { repo, metrics } = data;

    if (!repo || !metrics) {
      return NextResponse.json({ error: 'Missing required fields: repo, metrics' }, { status: 400 });
    }

    // The account owns a handle or it publishes nothing. An account predating the sign-in binding
    // has a null here; so does one whose bind failed on a handle collision. Either way the fix is
    // the same and the caller can act on it, which is why this is not a bare 403.
    const username = user.githubLogin;
    if (!username) {
      return NextResponse.json(
        { error: 'This account has no GitHub handle on record. Sign in again at /dashboard, then retry.' },
        { status: 409 },
      );
    }

    // Accepted for compatibility with clients that still send it, but it is only ever checked —
    // never used to decide where the write lands.
    if (typeof data.username === 'string' && data.username !== username) {
      return NextResponse.json(
        { error: `You can only publish as "${username}".` },
        { status: 403 },
      );
    }

    const existing = await prisma.journey.findUnique({
      where: { username_repo: { username, repo } },
      select: { userId: true },
    });

    if (existing && existing.userId !== user.id) {
      // Now reachable only through a handle change: someone published as `alice`, renamed on
      // GitHub, and a different account took the name. Deriving `username` from the key makes
      // this rare rather than impossible, so the ownership check stays — the upsert below would
      // otherwise reassign `userId` and hand over the older profile along with the name.
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
