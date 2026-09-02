import { NextRequest, NextResponse } from 'next/server';
import { ChannelType } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { getUser, isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateChannelsCache } from '@/lib/rtc/channels';
import { publishToChannel } from '@/lib/chat/signal';
import { listAdminChannels } from './queries';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

const NAME_MAX_LENGTH = 50;

export async function GET() {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const channels = await listAdminChannels();
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const body = (await req.json().catch(() => null)) as
    | { type?: unknown; name?: unknown; maxParticipants?: unknown }
    | null;

  const type = body?.type;
  if (type !== ChannelType.VOICE && type !== ChannelType.TEXT) return err(400, 'INVALID_TYPE');

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > NAME_MAX_LENGTH) return err(400, 'INVALID_NAME');

  let maxParticipants: number | null = null;
  if (type === ChannelType.VOICE) {
    const raw = body?.maxParticipants;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return err(400, 'INVALID_MAX_PARTICIPANTS');
    maxParticipants = raw;
  }

  const user = await getUser();

  try {
    // Sem UI de reordenar (ver §3 da RFC) — sortIndex é a ordem de criação
    // dentro do próprio tipo.
    const sortIndex = await prisma.channel.count({ where: { type } });

    const channel = await prisma.channel.create({
      data: { type, name, maxParticipants, sortIndex, createdById: user?.id },
    });
    invalidateChannelsCache();
    // Broadcast pra todo mundo conectado (mesmo bus do chat, ver signal.ts) —
    // sem isso a sidebar de quem não criou o canal só atualizaria no próximo
    // poll do useChannels (até 15s).
    publishToChannel({ type: 'channel_created', channelType: type });

    return NextResponse.json({ channel });
  } catch {
    return err(500, 'CREATE_FAILED');
  }
}
