import { NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getStatus, resolveAwaySince, type PresenceStatus, type PlatformPresenceUser } from '@/lib/presence/platformPresence';
import { persistAwaySince, clearAwaySince } from '@/lib/presence/lastActiveAt';
import { loadAllPresence } from '@/lib/rtc/presence';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';
import { channelsIdentity, PROFILE_MASK_SELECT } from '@/lib/profile/identity';
import type { GroupDTO } from '@/app/api/groups/types';

const STATUS_ORDER: Record<PresenceStatus, number> = { online: 0, away: 1, offline: 2 };

/** Em qual canal de voz cada pessoa está agora — presente de verdade na sala, não só com a aba aberta. Inclui quem está ensurdecido: ainda está no canal. */
async function loadActiveVoiceChannels(): Promise<Map<string, string>> {
  if (!(await isRtcEnabled())) return new Map();

  // Uma leitura do store cobre todos os canais de uma vez. Antes era um
  // loadPresence por canal, e cada canal vazio custava ~1s no LiveKit.
  const snapshot = await loadAllPresence();
  const channels = new Map<string, string>();
  for (const [channelId, participants] of Object.entries(snapshot)) {
    for (const participant of participants) {
      channels.set(participant.identity, channelId);
    }
  }
  return channels;
}

/** Lista de todo mundo da plataforma com status de presença, e os grupos existentes — usada pela sidebar de usuários. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json(null, { status: 401 });

  const [dbUsers, dbGroups, activeVoiceChannels] = await Promise.all([
    prisma.user.findMany({
      where: { roles: { hasSome: ['CANAL_ACCESS', 'ADMIN'] } },
      select: { id: true, ...PROFILE_MASK_SELECT, groups: true, lastActiveAt: true, chatBlocked: true, roles: true },
    }),
    prisma.group.findMany({ orderBy: { sortIndex: 'asc' } }),
    loadActiveVoiceChannels(),
  ]);

  const now = Date.now();

  // Sidebar de usuários é uma vitrine de quem dá pra chamar pra um canal — sem
  // canalAccess (ou ADMIN, que já implica acesso) a pessoa não consegue nem
  // entrar se for chamada, então nem listar faz sentido, esteja ela num grupo ou não.
  const users: PlatformPresenceUser[] = dbUsers
    .map((user) => {
      const voiceChannelId = activeVoiceChannels.get(user.id);

      // Presente numa sala de voz (ensurdecido ou não, aba em foco ou não)
      // nunca aparece offline pra quem tá vendo de fora — o heartbeat da
      // plataforma ainda manda quem fica online vs away (request frequente
      // vs 5min parado), só o piso "nunca offline" vem daqui.
      const computedStatus = getStatus(user.id, now);
      const activeStatus: PresenceStatus = voiceChannelId && computedStatus === 'offline' ? 'away' : computedStatus;

      // Label "há X minutos" só existe entre a transição pra away/offline e a
      // volta pra online — detectada aqui (cada leitura de presença é quem
      // percebe a transição) e persistida no Postgres como side-effect.
      const { awaySince, persistAction } = resolveAwaySince(user.id, activeStatus, user.lastActiveAt?.toISOString(), now);
      if (persistAction === 'set' && awaySince) {
        persistAwaySince(user.id, awaySince).catch((error) => console.error('[presence/users] failed to persist awaySince', error));
      } else if (persistAction === 'clear') {
        clearAwaySince(user.id).catch((error) => console.error('[presence/users] failed to clear awaySince', error));
      }

      // A sidebar é dos canais, então quem tem máscara aparece com ela — o
      // `username` cru do Discord não sai desta rota (ver lib/profile/identity).
      const identity = channelsIdentity(user);

      return {
        id: user.id,
        username: identity.username,
        avatar: identity.avatar,
        discordUsername: identity.discordUsername,
        isAdmin: user.roles.includes('ADMIN'),
        activeStatus,
        groups: user.groups,
        lastActiveAt: awaySince ?? undefined,
        chatBlocked: user.chatBlocked,
        voiceChannelId,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.activeStatus] - STATUS_ORDER[b.activeStatus] || a.username.localeCompare(b.username));

  return NextResponse.json({ users, groups: dbGroups satisfies GroupDTO[] });
}

export const dynamic = 'force-dynamic';
