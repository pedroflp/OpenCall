import { NextRequest, NextResponse } from 'next/server';
import { ChannelType } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateChannelsCache } from '@/lib/rtc/channels';
import { publishToChannel } from '@/lib/chat/signal';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

const NAME_MAX_LENGTH = 50;

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const existing = await prisma.channel.findUnique({ where: { id: params.channelId } });
  if (!existing) return err(404, 'CHANNEL_NOT_FOUND');

  const body = (await req.json().catch(() => null)) as { name?: unknown; maxParticipants?: unknown } | null;

  const data: { name?: string; maxParticipants?: number | null } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > NAME_MAX_LENGTH) return err(400, 'INVALID_NAME');
    data.name = name;
  }

  // maxParticipants só se aplica a voice (ver ADR-0001) — ignorado em silêncio pra texto.
  // `null` explícito remove o limite; ausente não mexe no que já está gravado.
  if (body?.maxParticipants !== undefined && existing.type === ChannelType.VOICE) {
    const raw = body.maxParticipants;
    if (raw === null) {
      data.maxParticipants = null;
    } else {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return err(400, 'INVALID_MAX_PARTICIPANTS');
      data.maxParticipants = raw;
    }
  }

  if (Object.keys(data).length === 0) return err(400, 'NO_VALID_FIELDS');

  try {
    const channel = await prisma.channel.update({ where: { id: params.channelId }, data });
    invalidateChannelsCache();
    publishToChannel({ type: 'channel_updated', channelType: channel.type });
    return NextResponse.json({ channel });
  } catch {
    return err(500, 'UPDATE_FAILED');
  }
}

/**
 * Hard-delete de verdade (ver ADR-0003, revisada — trocou o soft-delete
 * original) — a UI de admin exige double confirm (nome do canal digitado)
 * antes de chamar essa rota, já que não tem volta.
 *
 * TextMessage/TextChannelRead cascade pela FK (ver schema.prisma). VoiceChannelAlert
 * não tem FK pro canal (é uma tabela solta por channelId string) — limpa
 * manualmente na mesma transação pra não deixar linha órfã de alerta do Discord.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { channelId: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  try {
    const [, channel] = await prisma.$transaction([
      prisma.voiceChannelAlert.deleteMany({ where: { channelId: params.channelId } }),
      prisma.channel.delete({ where: { id: params.channelId } }),
    ]);
    invalidateChannelsCache();
    publishToChannel({ type: 'channel_deleted', channelType: channel.type });
    return new NextResponse(null, { status: 204 });
  } catch {
    return err(404, 'CHANNEL_NOT_FOUND');
  }
}
