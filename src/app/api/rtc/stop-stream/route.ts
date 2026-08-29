import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
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

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  const identity = (body as { identity?: unknown } | null)?.identity;
  if (typeof channelId !== 'string' || typeof identity !== 'string') return err(400, 'INVALID_BODY');

  const channel = getChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  try {
    // O próprio participante escuta a mudança desse attribute nele mesmo
    // (mesmo esquema do /unwatch) e encerra a transmissão local — evita
    // depender da semântica de mute remoto do LiveKit para telas
    // compartilhadas. Valor sempre novo (timestamp) garante que o evento
    // dispare mesmo se o admin encerrar mais de uma transmissão seguida.
    await livekitApi().room.updateParticipant(channel.id, identity, { attributes: { stopStream: String(Date.now()) } });
  } catch {
    return err(502, 'LIVEKIT_ERROR');
  }

  return NextResponse.json({ ok: true });
}
