import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { getUser, isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { buildRtcConfig, getChannel } from '@/lib/rtc/channels';
import { getChannelsConfig } from '@/lib/rtc/channelsConfig';
import { livekitApi, livekitUrl } from '@/lib/rtc/server';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { notifyChannelJoin } from '@/lib/discord/voiceChannelAlert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_SECONDS = 10 * 60;

// Cobre tanto entrar num canal quanto trocar de canal (join()/switchingChannel
// no VoiceProvider chamam essa rota) — cada join cria/confere uma sala no
// LiveKit, então um loop de troca de canal vira carga real no servidor.
const JOIN_RATE_LIMIT = { windowMs: 10_000, max: 6 };

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  // Kill switch e qualidade de transmissão saem da MESMA leitura: são a mesma
  // linha no banco (ver channelsConfig) e as duas entram neste caminho.
  const { enabled, streamSettings } = await getChannelsConfig();
  if (!enabled) return err(503, 'SERVICE_DISABLED');

  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`join:${user.id}`, JOIN_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json({ error: 'TOO_MANY_JOINS', retryAfterMs }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  if (typeof channelId !== 'string') return err(400, 'INVALID_CHANNEL');

  const channel = getChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  await livekitApi().room.createRoom({
    name: channel.id,
    maxParticipants: channel.maxParticipants,
    emptyTimeout: 300,
    departureTimeout: 20,
  });

  // Fire-and-forget: alerta no bate-papo do Discord não pode atrasar a
  // emissão do token (isso é o que trava o usuário entrando na chamada).
  notifyChannelJoin(channel, user).catch((error) => console.error('[rtc/join] failed to send channel alert', error));

  const isAdmin = await isCurrentUserAdmin();

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: user.id,
      name: user.username,
      // isAdmin viaja no metadata (visível a todos os participantes) pra dar
      // ao client o que precisa pra decidir se mostra "Desconectar" num admin
      // completo — a rota /api/rtc/kick é quem de fato garante a regra.
      metadata: JSON.stringify({ avatar: user.avatar, isAdmin }),
      ttl: TOKEN_TTL_SECONDS,
    }
  );

  token.addGrant({
    room: channel.id,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
      TrackSource.CAMERA,
    ],
    canUpdateOwnMetadata: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl(),
    identity: user.id,
    channel: { id: channel.id, name: channel.name },
    config: buildRtcConfig(streamSettings),
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
}
