import { NextResponse } from 'next/server';
import { processGemRoast } from '@/services/llm';

export async function POST(request: Request) {
  try {
    // Fail closed. Without signature verification this route is an unauthenticated way
    // for anyone to fan out work on our infrastructure — cheap while the roast is a
    // mock, billable the moment it calls a real model. Refuse to serve until the
    // signing key exists, so the endpoint cannot be abused before Phase 4 wires
    // @upstash/qstash's Receiver in.
    if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
      console.error('Webhook rejected: QSTASH_CURRENT_SIGNING_KEY is not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    // TODO: Phase 4 — verify the signature with @upstash/qstash Receiver before
    // trusting the body:
    //   const signature = request.headers.get('upstash-signature');
    //   await receiver.verify({ signature, body: await request.text() });
    // Until that lands, a configured signing key alone does NOT authenticate the
    // caller, so keep this route out of production.

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
