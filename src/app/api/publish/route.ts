import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.split(' ')[1];
    const user = await prisma.user.findUnique({ where: { apiKey } });

    if (!user) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const data = await request.json();
    const { username, repo, metrics } = data;

    if (!username || !repo || !metrics) {
      return NextResponse.json({ error: 'Missing required fields: username, repo, metrics' }, { status: 400 });
    }

    // Upsert the journey
    const journey = await prisma.journey.upsert({
      where: {
        username_repo: {
          username,
          repo,
        },
      },
      update: {
        metrics: JSON.stringify(metrics),
        userId: user.id,
      },
      create: {
        userId: user.id,
        username,
        repo,
        metrics: JSON.stringify(metrics),
      },
    });

    return NextResponse.json({ success: true, url: `/${username}/${repo}` });
  } catch (error: any) {
    console.error('Failed to publish journey:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
