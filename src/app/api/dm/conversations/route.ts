import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { hasCanalAccess, mapPrismaRoles } from '@/lib/access';
import { channelsIdentity, PROFILE_MASK_SELECT } from '@/lib/profile/identity';
import { orderParticipants } from '@/lib/dm/access';
import { countUnreadInConversation } from '@/lib/dm/unreadCount';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/** Lista as conversas do usuário autenticado — só as suas, nunca as de terceiros. */
export async function GET() {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const conversations = await prisma.directConversation.findMany({
    where: { OR: [{ participantAId: user.id }, { participantBId: user.id }] },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      participantA: { select: { id: true, ...PROFILE_MASK_SELECT } },
      participantB: { select: { id: true, ...PROFILE_MASK_SELECT } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { authorId: true, content: true, attachmentKind: true, createdAt: true },
      },
      reads: { where: { userId: user.id }, select: { lastReadMessageId: true, hiddenAt: true } },
    },
  });

  // Escondida (ver hiddenAt no schema) some da lista até chegar mensagem nova
  // depois do hiddenAt — reaparece sozinha, sem precisar de ação explícita
  // pra "desesconder".
  const visible = conversations.filter((conversation) => {
    const hiddenAt = conversation.reads[0]?.hiddenAt ?? null;
    if (!hiddenAt) return true;
    return Boolean(conversation.lastMessageAt && conversation.lastMessageAt > hiddenAt);
  });

  // `otherParticipant` é sempre o lado que NÃO é o usuário autenticado — o
  // cliente nunca precisa saber qual é "A" e qual é "B".
  const summaries = await Promise.all(
    visible.map(async (conversation) => {
      const other = conversation.participantAId === user.id ? conversation.participantB : conversation.participantA;
      const identity = channelsIdentity(other);
      const lastMessage = conversation.messages[0] ?? null;
      const lastReadMessageId = conversation.reads[0]?.lastReadMessageId ?? null;
      const unreadCount = await countUnreadInConversation(conversation.id, user.id, lastReadMessageId);

      return {
        id: conversation.id,
        otherParticipant: { id: other.id, ...identity },
        lastMessage: lastMessage
          ? {
              authorId: lastMessage.authorId,
              content: lastMessage.content,
              hasAttachment: Boolean(lastMessage.attachmentKind),
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unreadCount,
        updatedAt: (conversation.lastMessageAt ?? conversation.createdAt).toISOString(),
      };
    }),
  );

  return NextResponse.json({ conversations: summaries });
}

interface PostBody {
  userId?: unknown;
}

/** Acha-ou-cria a conversa com o usuário alvo. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body || typeof body.userId !== 'string' || !body.userId) return err(400, 'INVALID_BODY');
  if (body.userId === user.id) return err(400, 'CANNOT_DM_SELF');

  const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, roles: true } });
  if (!target || !hasCanalAccess(mapPrismaRoles(target.roles))) return err(404, 'USER_NOT_FOUND');

  // Par já ordenado: dois usuários mandando "iniciar conversa" um pro outro
  // ao mesmo tempo resolvem pro mesmo par, e o upsert sobre o unique composto
  // deixa o Postgres resolver a corrida sozinho, sem try/catch manual.
  const { participantAId, participantBId } = orderParticipants(user.id, target.id);

  const conversation = await prisma.directConversation.upsert({
    where: { participantPair: { participantAId, participantBId } },
    create: { participantAId, participantBId },
    update: {},
    select: { id: true },
  });

  // Reabrir pelo picker desfaz o "remover da barra lateral" pro lado de quem
  // reabriu — mesmo efeito que chegar mensagem nova, só que explícito.
  await prisma.directConversationRead.upsert({
    where: { userId_conversationId: { userId: user.id, conversationId: conversation.id } },
    create: { userId: user.id, conversationId: conversation.id },
    update: { hiddenAt: null },
  });

  return NextResponse.json({ id: conversation.id });
}
