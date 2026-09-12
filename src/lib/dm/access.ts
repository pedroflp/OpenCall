import { prisma } from '@/services/prisma';

/**
 * Toda rota que toca uma conversa chama isto PRIMEIRO, antes de qualquer outra
 * coisa — inclusive antes do rate limit, pra 404 rápido sem gastar orçamento
 * de rate limit de quem não é participante (ver docs/rfc-mensagens-diretas.md).
 *
 * Responde null tanto pra conversa inexistente quanto pra conversa alheia —
 * de propósito: um 403 confirmaria pra um usuário curioso que aquele
 * conversationId existe e pertence a alguém. Toda rota trata null como 404,
 * nunca 403.
 */
export async function getConversationForParticipant(conversationId: string, userId: string) {
  return prisma.directConversation.findFirst({
    where: { id: conversationId, OR: [{ participantAId: userId }, { participantBId: userId }] },
  });
}

/**
 * participantAId é sempre o menor id dos dois — "A"/"B" não significam "quem
 * iniciou", são só a chave de deduplicação do par. Isso é o que permite
 * achar-ou-criar via upsert sobre o unique composto: duas pessoas clicando
 * "mandar mensagem" uma pra outra ao mesmo tempo resolvem pro mesmo par, e o
 * Postgres resolve a corrida sozinho.
 */
export function orderParticipants(userId: string, otherUserId: string): { participantAId: string; participantBId: string } {
  return userId < otherUserId
    ? { participantAId: userId, participantBId: otherUserId }
    : { participantAId: otherUserId, participantBId: userId };
}
