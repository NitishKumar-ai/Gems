import { NextResponse } from 'next/server';
import { processGemRoast } from '@/services/llm';

export async function POST(request: Request) {
  try {
    // 1. Verify QStash Signature
    // In production, use @upstash/qstash to verify the webhook signature.
    // const signature = request.headers.get('upstash-signature');
    // await receiver.verify({ signature, body: request.body });

    const { owner, repo } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json({ error: 'owner and repo required' }, { status: 400 });
    }

    // 2. Process the heavy LLM roast asynchronously
    // QStash calls this endpoint, so we can take up to the max Vercel timeout (e.g. 15-60s)
    await processGemRoast(owner, repo);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('QStash Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
