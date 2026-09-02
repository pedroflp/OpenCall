import type { ChannelType } from '@prisma/client';
import type { MessageDTO } from '@/lib/chat/dto';

/**
 * Pub-sub em memória pro canal de texto — mesmo padrão de callSignal.ts (app
 * roda como processo único no Railway, ver D3 na RFC-008). Diferença: ali a
 * publicação é direcionada a um usuário; aqui é broadcast pra todo mundo
 * conectado, com exclusão opcional do remetente (usada só pelo `typing`).
 *
 * Se um dia escalar horizontalmente, o corpo de publishToChannel vira um
 * PUBLISH no Redis e o boot assina o canal — nenhuma rota muda (ver §6.4).
 */
export type ChatEvent =
  | { type: 'message'; channelId: string; message: MessageDTO; clientNonce: string }
  | { type: 'deleted'; channelId: string; id: string }
  | { type: 'cleared'; channelId: string; ids: string[] }
  | { type: 'typing'; channelId: string; user: { id: string; username: string } }
  | { type: 'blocked'; userId: string; blocked: boolean }
  /** Máscara de perfil mudou — quem tem DTO na tela busca de novo (ver propagateProfileChange). */
  | { type: 'profile'; user: { id: string; username: string; avatar: string; discordUsername: string | null } }
  | { type: 'channel_created'; channelType: ChannelType }
  | { type: 'channel_updated'; channelType: ChannelType }
  | { type: 'channel_deleted'; channelType: ChannelType };

type Send = (event: ChatEvent) => void;

const subscribers = new Map<string, Set<Send>>();

export function subscribeToChatEvents(userId: string, send: Send): () => void {
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

export function publishToChannel(event: ChatEvent, exceptUserId?: string): void {
  for (const [userId, set] of subscribers) {
    if (userId === exceptUserId) continue;
    for (const send of set) send(event);
  }
}
