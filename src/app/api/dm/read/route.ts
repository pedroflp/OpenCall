import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { getConversationForParticipant } from '@/lib/dm/access';
import { countUnreadInConversation } from '@/lib/dm/unreadCount';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const conversationId = new URL(req.url).searchParams.get('conversationId');
  if (!conversationId) return err(400, 'MISSING_CONVERSATION');

  const conversation = await getConversationForParticipant(conversationId, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  const read = await prisma.directConversationRead.findUnique({
    where: { userId_conversationId: { userId: user.id, conversationId: conversation.id } },
    select: { lastReadMessageId: true },
  });

  const lastReadMessageId = read?.lastReadMessageId ?? null;
  const unreadCount = await countUnreadInConversation(conversation.id, user.id, lastReadMessageId);

  return NextResponse.json({ lastReadMessageId, unreadCount });
}

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = (await req.json().catch(() => null)) as { conversationId?: unknown; messageId?: unknown } | null;
  if (!body || typeof body.conversationId !== 'string' || typeof body.messageId !== 'string') return err(400, 'INVALID_BODY');
  const conversationId = body.conversationId;

  const conversation = await getConversationForParticipant(conversationId, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  // Rejeita messageId que não pertence a ESTA conversationId.
  const message = await prisma.directMessage.findFirst({
    where: { id: body.messageId, conversationId: conversation.id },
    select: { id: true, createdAt: true },
  });
  if (!message) return err(404, 'MESSAGE_NOT_FOUND');

  const current = await prisma.directConversationRead.findUnique({
    where: { userId_conversationId: { userId: user.id, conversationId: conversation.id } },
    select: { lastReadMessageId: true },
  });

  // Monotônico: uma aba secundária rolada pra cima não pode "desleer" o que a
  // aba principal já marcou como lido (mesma regra do canal geral).
  if (current?.lastReadMessageId) {
    const currentMessage = await prisma.directMessage.findUnique({
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

  await prisma.directConversationRead.upsert({
    where: { userId_conversationId: { userId: user.id, conversationId: conversation.id } },
    create: { userId: user.id, conversationId: conversation.id, lastReadMessageId: message.id },
    update: { lastReadMessageId: message.id },
  });

  return NextResponse.json({ ok: true });
}
