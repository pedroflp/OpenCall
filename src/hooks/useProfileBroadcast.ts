'use client';

import { useEffect } from 'react';
import type { ChatEvent } from '@/lib/chat/signal';
import { subscribeToChatConnection } from '@/lib/chat/realtime';
import { applyProfileLocally } from '@/hooks/usePlatformPresenceUsers';

/**
 * Recebe o evento `profile` (alguém trocou apelido ou foto, ver
 * lib/profile/propagate.ts) e repassa pra sidebar de usuários.
 *
 * Mora num hook próprio, montado uma vez na ChannelsSidebar, e não dentro do
 * `usePlatformPresenceUsers`: aquele store é um poll de HTTP e não tem nada a
 * ver com SSE — dar a ele uma assinatura de EventSource amarraria a lista de
 * presença ao canal de texto pra sempre. Aqui a ligação fica visível e num
 * lugar só.
 *
 * As MENSAGENS do chat não passam por aqui: `useChatMessages` já é assinante do
 * mesmo barramento e trata o evento no próprio cache (ver o ramo `profile` lá).
 */
export function useProfileBroadcast(): void {
  useEffect(
    () =>
      subscribeToChatConnection((event: ChatEvent) => {
        if (event.type !== 'profile') return;
        applyProfileLocally(event.user.id, event.user);
      }),
    [],
  );
}
