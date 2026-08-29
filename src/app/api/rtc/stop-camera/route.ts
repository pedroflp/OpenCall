import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { getChannel } from '@/lib/rtc/channels';
import { livekitApi } from '@/lib/rtc/server';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await isRtcEnabled())) return err(503, 'SERVICE_DISABLED');

  const session = await auth();
  if (!session?.user?.isChannelsAdmin) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  const identity = (body as { identity?: unknown } | null)?.identity;
  if (typeof channelId !== 'string' || typeof identity !== 'string') return err(400, 'INVALID_BODY');

  const channel = getChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  try {
    // Mesmo esquema do /stop-stream e do /mute: o próprio participante escuta
    // a mudança desse attribute nele mesmo e desliga a câmera local — o
    // servidor não força de fato o unpublish de um track do client. Valor
    // sempre novo (timestamp) garante que o evento dispare mesmo se o admin
    // desligar a câmera mais de uma vez seguida.
    await livekitApi().room.updateParticipant(channel.id, identity, { attributes: { stopCamera: String(Date.now()) } });
  } catch {
    return err(502, 'LIVEKIT_ERROR');
  }

  return NextResponse.json({ ok: true });
}
