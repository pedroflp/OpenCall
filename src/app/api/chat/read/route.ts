import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { TEXT_CHANNEL_ID } from '@/lib/chat/channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

async function countUnread(userId: string, lastReadMessageId: string | null, mentionsOnly: boolean): Promise<number> {
  const mentionFilter = mentionsOnly ? { mentions: { some: { userId } } } : {};

  if (lastReadMessageId) {
    const lastRead = await prisma.textMessage.findUnique({ where: { id: lastReadMessageId }, select: { createdAt: true } });
    if (lastRead) {
      return prisma.textMessage.count({
        where: {
          channelId: TEXT_CHANNEL_ID,
          deletedAt: null,
          authorId: { not: userId },
          ...mentionFilter,
          OR: [
            { createdAt: { gt: lastRead.createdAt } },
            { createdAt: lastRead.createdAt, id: { gt: lastReadMessageId } },
          ],
        },
      });
    }
  }

  // Sem leitura registrada (ou a mensagem lida sumiu de algum jeito): conta
  // tudo desde a criação da conta, não o histórico inteiro do canal.
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  return prisma.textMessage.count({
    where: {
      channelId: TEXT_CHANNEL_ID,
      deletedAt: null,
      authorId: { not: userId },
      ...mentionFilter,
      ...(dbUser ? { createdAt: { gte: dbUser.createdAt } } : {}),
    },
  });
}

export async function GET() {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const read = await prisma.textChannelRead.findUnique({
    where: { userId_channelId: { userId: user.id, channelId: TEXT_CHANNEL_ID } },
    select: { lastReadMessageId: true },
  });

  const lastReadMessageId = read?.lastReadMessageId ?? null;
  const [unreadCount, mentionUnreadCount] = await Promise.all([
    countUnread(user.id, lastReadMessageId, false),
    countUnread(user.id, lastReadMessageId, true),
  ]);

  return NextResponse.json({ lastReadMessageId, unreadCount, mentionUnreadCount });
}

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = (await req.json().catch(() => null)) as { messageId?: unknown } | null;
  if (!body || typeof body.messageId !== 'string') return err(400, 'INVALID_BODY');

  const message = await prisma.textMessage.findUnique({
    where: { id: body.messageId },
    select: { id: true, channelId: true, createdAt: true },
  });
  if (!message || message.channelId !== TEXT_CHANNEL_ID) return err(404, 'MESSAGE_NOT_FOUND');

  const current = await prisma.textChannelRead.findUnique({
    where: { userId_channelId: { userId: user.id, channelId: TEXT_CHANNEL_ID } },
    select: { lastReadMessageId: true },
  });

  // Monotônico: uma aba secundária rolada pra cima não pode "desleer" o que a
  // aba principal já marcou como lido (ver D10 / §5.6 da RFC-008).
  if (current?.lastReadMessageId) {
    const currentMessage = await prisma.textMessage.findUnique({
      where: { id: current.lastReadMessageId },
      select: { createdAt: true },
    });
    if (
      currentMessage &&
      (currentMessage.createdAt > message.createdAt ||
        (currentMessage.createdAt.getTime() === message.createdAt.getTime() && current.lastReadMessageId > message.id))
    ) {
      return NextResponse.json({ ok: true, ignored: true });
    }
  }

  await prisma.textChannelRead.upsert({
    where: { userId_channelId: { userId: user.id, channelId: TEXT_CHANNEL_ID } },
    create: { userId: user.id, channelId: TEXT_CHANNEL_ID, lastReadMessageId: message.id },
    update: { lastReadMessageId: message.id },
  });

  return NextResponse.json({ ok: true });
}
