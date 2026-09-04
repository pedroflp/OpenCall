import { NextRequest, NextResponse } from 'next/server';
import { ServerError } from 'livekit-server-sdk';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getVoiceChannel } from '@/lib/rtc/channels';
import { livekitApi } from '@/lib/rtc/server';
import { dropParticipant } from '@/lib/rtc/presence';
import { checkRateLimit } from '@/lib/rtc/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mais folgado que o join (ver JOIN_RATE_LIMIT em api/rtc/join) porque leave é
// best-effort e fire-and-forget no client (forceLeaveChannel já engole erro) —
// isso aqui é só um teto pra não sobrar loop chamando removeParticipant à toa.
const LEAVE_RATE_LIMIT = { windowMs: 10_000, max: 10 };

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

// Sem isso, um disconnect explícito (sair do canal ou trocar de canal) ainda
// deixa o participante em estado ACTIVE no LiveKit até o departureTimeout da
// sala expirar (ver createRoom em /api/rtc/join) — o servidor não distingue
// uma saída intencional de uma queda de rede que pode reconectar. Nesse meio
// tempo, listParticipants (usado pela presença) segue listando o usuário no
// canal que ele já deixou. RemoveParticipant força o estado pra DISCONNECTED
// na hora, sem esperar a janela de reconexão.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`leave:${user.id}`, LEAVE_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json({ error: 'TOO_MANY_REQUESTS', retryAfterMs }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  if (typeof channelId !== 'string') return err(400, 'INVALID_CHANNEL');

  const channel = await getVoiceChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  // Tira do store na hora, sem reler o LiveKit. Reler no exato instante do
  // removeParticipant frequentemente ainda traria o participante e
  // re-popularia o cache com o fantasma por mais 3s. Aqui a remoção é local e
  // autoritativa (o removeParticipant abaixo já foi aceito pelo LiveKit), e
  // quem estiver olhando de fora recebe a mudança pelo SSE no mesmo tick.
  function forgetParticipant() {
    dropParticipant(channel!.id, user!.id);
  }

  try {
    await livekitApi().room.removeParticipant(channel.id, user.id);
  } catch (error) {
    // Sala ou participante já não existem (saiu antes, sala fechou) — é
    // exatamente o estado que queríamos alcançar, não um erro.
    if (error instanceof ServerError && error.status === 404) {
      forgetParticipant();
      return NextResponse.json({ ok: true });
    }
    return err(502, 'LIVEKIT_ERROR');
  }

  forgetParticipant();

  return NextResponse.json({ ok: true });
}
