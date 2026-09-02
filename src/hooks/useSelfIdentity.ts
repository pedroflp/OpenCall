'use client';

import { useEffect, useState } from 'react';
import type { UserDTO } from '@/app/api/user/types';
import { subscribeToChatConnection } from '@/lib/chat/realtime';
import type { ChatEvent } from '@/lib/chat/signal';
import { channelsIdentity, type ChannelsIdentity } from '@/lib/profile/identity';

/**
 * A identidade de canais de QUEM ESTÁ OLHANDO (ver lib/profile/identity.ts):
 * resolvida do UserDTO, e mantida viva pelo evento `profile`.
 *
 * O UserDTO é prop de Server Component (app/(channels)/layout.tsx), e a única
 * forma de renová-lo é o `router.refresh()` que a aba Perfil dispara depois de
 * salvar — um round-trip inteiro de RSC, atrás de um POST que ainda espera o
 * LiveKit (ver propagateProfileChange). Até ele voltar, o rodapé da sidebar e
 * os cards de voz continuam com a foto velha ao lado de uma lista de usuários
 * que já trocou: ela ouve o evento `profile`, que chega primeiro.
 *
 * Este hook põe as duas superfícies no mesmo relógio, ouvindo o mesmo evento.
 * E ele vence a prop sem data de validade porque nunca pode ser o mais velho
 * dos dois: TODA mudança de máscara passa por `propagateProfileChange` — de
 * qualquer aba, dispositivo ou do /admin —, e o autor recebe o broadcast junto
 * com todo mundo. O `router.refresh()` continua valendo, e é ele quem cobre o
 * resto da árvore (a própria aba Perfil, o compositor do chat).
 *
 * Só serve pra SI MESMO. A identidade dos outros já vem resolvida do servidor
 * dentro do DTO de cada superfície (presença, mensagem, participante).
 */
export function useSelfIdentity(user: UserDTO | null): ChannelsIdentity | null {
  const [broadcast, setBroadcast] = useState<ChannelsIdentity | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    return subscribeToChatConnection((event: ChatEvent) => {
      if (event.type !== 'profile' || event.user.id !== userId) return;
      setBroadcast({
        username: event.user.username,
        avatar: event.user.avatar,
        discordUsername: event.user.discordUsername,
      });
    });
  }, [userId]);

  return broadcast ?? (user ? channelsIdentity(user) : null);
}
