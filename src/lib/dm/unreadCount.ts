import { prisma } from '@/services/prisma';

/**
 * Generalização de countUnread (/api/chat/read) pra filtrar por
 * conversationId em vez de channelId.
 *
 * Sem fallback por "data de criação da conta": diferente do canal geral (que
 * pode ter histórico anterior ao usuário), uma DirectConversation é sempre
 * mais nova que os dois participantes por construção — sem lastReadMessageId,
 * conta TODAS as mensagens da conversa de autoria do outro participante.
 */
export async function countUnreadInConversation(
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
): Promise<number> {
  if (lastReadMessageId) {
    const lastRead = await prisma.directMessage.findUnique({ where: { id: lastReadMessageId }, select: { createdAt: true } });
    if (lastRead) {
      return prisma.directMessage.count({
        where: {
          conversationId,
          deletedAt: null,
          authorId: { not: userId },
          OR: [
            { createdAt: { gt: lastRead.createdAt } },
            { createdAt: lastRead.createdAt, id: { gt: lastReadMessageId } },
          ],
        },
      });
    }
  }

  return prisma.directMessage.count({
    where: { conversationId, deletedAt: null, authorId: { not: userId } },
  });
}
