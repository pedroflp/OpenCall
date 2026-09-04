import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getVoiceChannel } from '@/lib/rtc/channels';
import { getStatus } from '@/lib/presence/platformPresence';
import { getCallCooldownRemaining, startCall } from '@/lib/rtc/callSignal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

// Debaixo de /api/rtc pra herdar o gate de canalAccess do middleware — só quem
// já tem acesso ao canal pode ligar pra alguém entrar nele.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = await req.json().catch(() => null);
  const targetUserId = (body as { targetUserId?: unknown } | null)?.targetUserId;
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  if (typeof targetUserId !== 'string' || !targetUserId) return err(400, 'INVALID_TARGET');
  if (typeof channelId !== 'string' || !channelId) return err(400, 'INVALID_CHANNEL');
  if (targetUserId === user.id) return err(400, 'CANNOT_CALL_SELF');

  const channel = await getVoiceChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  // Mesma régua da PlatformUsersSidebar (online/ausente) — checada de novo
  // aqui, não só no client.
  if (getStatus(targetUserId) === 'offline') return err(400, 'TARGET_OFFLINE');

  const remaining = getCallCooldownRemaining(user.id, targetUserId);
  if (remaining > 0) {
    return NextResponse.json({ error: 'COOLDOWN', retryAfterMs: remaining }, { status: 429 });
  }

  const call = startCall({
    callerId: user.id,
    targetId: targetUserId,
    channelId: channel.id,
    channelName: channel.name,
    from: { id: user.id, username: user.username, avatar: user.avatar },
  });

  return NextResponse.json({ success: true, callId: call.id });
}
