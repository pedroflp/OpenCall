import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { getVoiceChannel } from '@/lib/rtc/channels';
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
  const muted = (body as { muted?: unknown } | null)?.muted;
  if (typeof channelId !== 'string' || typeof identity !== 'string' || typeof muted !== 'boolean') {
    return err(400, 'INVALID_BODY');
  }

  const channel = await getVoiceChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  try {
    // O próprio participante escuta a mudança desse attribute nele mesmo (mesmo
    // esquema do /stop-stream) e desliga o microfone local — evita depender da
    // semântica de mute remoto do LiveKit, que não impede o participante de
    // simplesmente reativar o track em seguida.
    await livekitApi().room.updateParticipant(channel.id, identity, { attributes: { serverMuted: muted ? '1' : '0' } });
  } catch {
    return err(502, 'LIVEKIT_ERROR');
  }

  return NextResponse.json({ ok: true });
}
