import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { respondToCall } from '@/lib/rtc/callSignal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = await req.json().catch(() => null);
  const callId = (body as { callId?: unknown } | null)?.callId;
  const accept = (body as { accept?: unknown } | null)?.accept;
  if (typeof callId !== 'string' || !callId) return err(400, 'INVALID_CALL_ID');
  if (typeof accept !== 'boolean') return err(400, 'INVALID_ACCEPT');

  const call = respondToCall(user.id, callId, accept);
  if (!call) return err(404, 'CALL_NOT_FOUND');

  return NextResponse.json({ success: true, channelId: call.channelId });
}
