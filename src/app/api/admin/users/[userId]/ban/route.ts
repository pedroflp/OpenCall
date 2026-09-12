import { NextRequest, NextResponse } from 'next/server';
import { ServerError } from 'livekit-server-sdk';
import { UserRole } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { getUser, isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateRolesCache } from '@/lib/access';
import { getVoiceChannels } from '@/lib/rtc/channels';
import { livekitApi } from '@/lib/rtc/server';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/**
 * Best-effort: acha o usuário numa sala de voz ativa e remove. Não é o que
 * garante o banimento (isso é CANAL_ACCESS fora de `roles` + bannedAt, ver
 * abaixo) — só evita a pessoa continuar na call até a hora de sair sozinha.
 * Mesma varredura listRooms→listParticipants de refreshFromLiveKit em
 * lib/rtc/presence.ts, mas parando no primeiro match em vez de ler tudo.
 */
async function disconnectFromVoice(userId: string): Promise<void> {
  try {
    const channels = await getVoiceChannels();
    const ids = channels.map((channel) => channel.id);
    if (ids.length === 0) return;

    const rooms = await livekitApi().room.listRooms(ids);
    const populated = rooms.filter((room) => room.numParticipants > 0).map((room) => room.name);

    for (const channelId of populated) {
      try {
        const participants = await livekitApi().room.listParticipants(channelId);
        if (participants.some((participant) => participant.identity === userId)) {
          await livekitApi().room.removeParticipant(channelId, userId);
        }
      } catch (error) {
        if (error instanceof ServerError && error.status === 404) continue;
        throw error;
      }
    }
  } catch (error) {
    console.error('[admin/users/ban] falha ao desconectar da voz:', error);
  }
}

/**
 * Banir é mais forte que o toggle de CANAL_ACCESS (ver rota irmã
 * canal-access/): além de tirar CANAL_ACCESS e CHANNELS_ACCESS de `roles`,
 * marca bannedAt/bannedById — carimbo que /api/invite/redeem passa a checar
 * pra recusar resgate de um convite novo. Sem esse carimbo, remover só os
 * roles não seguraria a pessoa: ela reentraria com qualquer código válido.
 */
export async function POST(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const admin = await getUser();
  if (!admin) return err(401, 'UNAUTHENTICATED');
  if (admin.id === params.userId) return err(400, 'CANNOT_BAN_SELF');

  try {
    const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { roles: true } });
    if (!target) return err(404, 'USER_NOT_FOUND');
    // Mesma regra de /api/rtc/kick: ninguém bane um ADMIN por aqui.
    if (target.roles.includes(UserRole.ADMIN)) return err(403, 'CANNOT_BAN_ADMIN');

    const roles = target.roles.filter((role) => role !== UserRole.CANAL_ACCESS && role !== UserRole.CHANNELS_ACCESS);
    await prisma.user.update({
      where: { id: params.userId },
      data: { roles, bannedAt: new Date(), bannedById: admin.id },
    });
    invalidateRolesCache(params.userId);
  } catch {
    return err(500, 'BAN_FAILED');
  }

  await disconnectFromVoice(params.userId);
  return NextResponse.json({ success: true });
}

/** Desbanir só libera o resgate de convite de novo — não devolve CANAL_ACCESS sozinho, isso é o toggle de acesso, uma ação separada do admin. */
export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  try {
    await prisma.user.update({ where: { id: params.userId }, data: { bannedAt: null, bannedById: null } });
    invalidateRolesCache(params.userId);
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'UNBAN_FAILED');
  }
}

export const dynamic = 'force-dynamic';
