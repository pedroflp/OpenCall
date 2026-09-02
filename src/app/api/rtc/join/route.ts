import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { getUser, isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { buildRtcConfig, getVoiceChannel } from '@/lib/rtc/channels';
import { loadChannelsIdentity } from '@/lib/profile/query';
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

  const channel = await getVoiceChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');
  // Disparada ANTES do createRoom e esperada só na hora de montar o token: a
  // máscara de perfil é uma ida ao Postgres, e o createRoom é uma ida ao
  // LiveKit — em paralelo, a que chega segundo é a única que se paga. Em série
  // isso seria latência somada no caminho mais sensível do app, que é entrar
  // numa chamada.
  const identityPromise = loadChannelsIdentity(user.id, { username: user.username, avatar: user.avatar });

  // maxParticipants null é canal sem limite (o admin desligou "Limitar tamanho"),
  // não configuração quebrada — createRoom sem a chave cria sala sem teto.
  await livekitApi().room.createRoom({
    name: channel.id,
    ...(channel.maxParticipants === null ? {} : { maxParticipants: channel.maxParticipants }),
    emptyTimeout: 300,
    departureTimeout: 20,
  });

  const [identity, isAdmin] = await Promise.all([identityPromise, isCurrentUserAdmin()]);

  // Fire-and-forget: alerta no bate-papo do Discord não pode atrasar a
  // emissão do token (isso é o que trava o usuário entrando na chamada). Vai
  // com a máscara: o alerta é sobre o canal, não sobre o Discord.
  notifyChannelJoin(channel, identity).catch((error) => console.error('[rtc/join] failed to send channel alert', error));

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: user.id,
      // O NOME e o AVATAR do card de voz saem daqui — é o token que carimba os
      // dois no participante do LiveKit. Trocar a máscara com a sala cheia
      // reescreve isto ao vivo por updateParticipant (ver lib/profile/propagate).
      name: identity.username,
      // isAdmin viaja no metadata (visível a todos os participantes) pra dar
      // ao client o que precisa pra decidir se mostra "Desconectar" num admin
      // completo — a rota /api/rtc/kick é quem de fato garante a regra.
      // `discordUsername` só existe quando um apelido está cobrindo o nome real
      // — é o que o popover mostra embaixo dele. Ausente quer dizer "o nome
      // grande já é o do Discord", não "não sei".
      metadata: JSON.stringify({
        avatar: identity.avatar,
        isAdmin,
        ...(identity.discordUsername ? { discordUsername: identity.discordUsername } : {}),
      }),
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
