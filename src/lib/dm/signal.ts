import type { BaseMessageDTO } from '@/lib/chat/dto';

/**
 * Pub-sub em memória pra DM — DIRECIONADO a um usuário, não broadcast como
 * lib/chat/signal.ts (que é público de propósito: qualquer conteúdo de canal
 * pode ir pra todo mundo conectado). DM é privada — publicar como broadcast
 * vazaria conteúdo de mensagem direta pro EventSource de gente que não
 * participa da conversa.
 *
 * Motivo de segurança, não só estilo: com a publicação só aceitando os dois
 * ids do par, não existe nenhum caminho de código que itere "todo mundo
 * conectado" pra um evento de DM — mesmo que uma rota tenha um bug de auth no
 * futuro, o transporte em si não consegue vazar.
 *
 * Se um dia escalar horizontalmente, o corpo de publish vira um PUBLISH no
 * Redis, mesma nota de lib/chat/signal.ts.
 */
export type DmEvent =
  | { type: 'message'; conversationId: string; message: BaseMessageDTO; clientNonce: string }
  | { type: 'deleted'; conversationId: string; id: string }
  | { type: 'typing'; conversationId: string; user: { id: string; username: string } };

type Send = (event: DmEvent) => void;

/** Uma entrada por aba aberta com o EventSource conectado. */
const subscribers = new Map<string, Set<Send>>();

export function subscribeToDmEvents(userId: string, send: Send): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
    if (set!.size === 0) subscribers.delete(userId);
  };
}

function publish(userId: string, event: DmEvent): void {
  const set = subscribers.get(userId);
  if (!set) return;
  for (const send of set) send(event);
}

/** Único ponto de entrada pra publicar um evento de DM — só aceita os dois ids do par, nunca uma lista arbitrária. */
export function publishToParticipants(
  conversation: { participantAId: string; participantBId: string },
  event: DmEvent,
  exceptUserId?: string,
): void {
  if (conversation.participantAId !== exceptUserId) publish(conversation.participantAId, event);
  if (conversation.participantBId !== exceptUserId) publish(conversation.participantBId, event);
}
