'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { ChannelType } from '@prisma/client';
// Type-only: apagado na compilação, então não puxa lib/rtc/channels (Prisma)
// pro bundle client (ver nota em lib/chat/textChannels.ts).
import type { Channel } from '@/lib/rtc/channels';
import { subscribeToChatConnection } from '@/lib/chat/realtime';

async function fetcher(url: string): Promise<{ channels: Channel[] }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Falha ao carregar canais');
  return response.json();
}

/**
 * Canais em trânsito — criados ou apagados agora, ainda não refletidos no que
 * o servidor devolve. Ficam num store de módulo (não em estado de componente)
 * porque quem dispara a escrita é um diálogo que desmonta logo em seguida, e
 * quem precisa mostrar o shimmer é a sidebar, que fica montada.
 *
 * A entrada só sai quando o próprio servidor confirma — o placeholder de
 * criação some quando o id real aparece na lista, e o de exclusão some quando
 * o id some dela. Assim o shimmer dura exatamente o tempo do voo, sem timer
 * arbitrário nem risco de piscar de volta.
 */
interface PendingCreate {
  channel: Channel;
  /** Preenchido quando o POST responde — é o id que esperamos ver na lista. */
  realId: string | null;
}

const pendingCreates = new Map<string, PendingCreate>();
const pendingDeletes = new Map<string, ChannelType>();
const listeners = new Set<() => void>();
let version = 0;
let tempIdCounter = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Placeholder otimista de canal novo — devolve o id temporário pra fechar o ciclo depois. */
export function beginChannelCreate(type: ChannelType, name: string): string {
  tempIdCounter += 1;
  const tempId = `pending-${tempIdCounter}`;
  pendingCreates.set(tempId, {
    channel: { id: tempId, type, name, maxParticipants: null, sortIndex: Number.MAX_SAFE_INTEGER },
    realId: null,
  });
  notify();
  return tempId;
}

/** POST respondeu: agora sabemos qual id esperar na próxima leitura da lista. */
export function resolveChannelCreate(tempId: string, realId: string): void {
  const pending = pendingCreates.get(tempId);
  if (!pending) return;
  pendingCreates.set(tempId, { ...pending, realId });
  notify();
}

/** POST falhou — tira o placeholder em vez de deixar um canal fantasma piscando pra sempre. */
export function cancelChannelCreate(tempId: string): void {
  if (!pendingCreates.delete(tempId)) return;
  notify();
}

export function beginChannelDelete(channel: Pick<Channel, 'id' | 'type'>): void {
  pendingDeletes.set(channel.id, channel.type);
  notify();
}

export function cancelChannelDelete(channelId: string): void {
  if (!pendingDeletes.delete(channelId)) return;
  notify();
}

/** Deriva do que o servidor devolveu quais pendências já viraram realidade. Só olha o tipo recém-buscado — a outra lista tem SWR próprio. */
function reconcile(type: ChannelType, fetched: Channel[]): void {
  const ids = new Set(fetched.map((channel) => channel.id));
  let changed = false;

  for (const [tempId, pending] of pendingCreates) {
    if (pending.channel.type !== type) continue;
    if (pending.realId && ids.has(pending.realId)) {
      pendingCreates.delete(tempId);
      changed = true;
    }
  }

  for (const [channelId, deletedType] of pendingDeletes) {
    if (deletedType !== type) continue;
    if (!ids.has(channelId)) {
      pendingDeletes.delete(channelId);
      changed = true;
    }
  }

  if (changed) notify();
}

function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Lista de canais ativos de um tipo, com polling — mesmo padrão de
 * useRtcEnabled (SWR com refreshInterval), pra sidebar refletir canal
 * criado/arquivado por outra sessão sem precisar de um deploy nem de um F5.
 *
 * `pendingIds` marca as linhas em trânsito (ver store acima) pra sidebar
 * renderizá-las apagadas + shimmer em vez de aparecerem/sumirem num piscar.
 */
function useChannels(type: ChannelType): { channels: Channel[]; pendingIds: Set<string>; loading: boolean } {
  const { data, isLoading, mutate } = useSWR<{ channels: Channel[] }>(`/api/channels?type=${type}`, fetcher, {
    dedupingInterval: 10_000,
    refreshInterval: 15_000,
  });

  // Canal criado/editado/excluído em outra sessão chega pelo mesmo SSE do
  // chat (ver signal.ts) — revalida na hora em vez de esperar o próximo poll.
  useEffect(() => {
    return subscribeToChatConnection((event) => {
      const isChannelEvent =
        event.type === 'channel_created' || event.type === 'channel_updated' || event.type === 'channel_deleted';
      if (isChannelEvent && event.channelType === type) void mutate();
    });
  }, [type, mutate]);

  const fetched = data?.channels;
  useEffect(() => {
    if (fetched) reconcile(type, fetched);
  }, [type, fetched]);

  // O snapshot é só a versão do store: o conteúdo é lido direto dos Maps no
  // corpo do render, senão getSnapshot devolveria um array novo toda chamada
  // e o useSyncExternalStore entraria em loop.
  useSyncExternalStore(
    subscribePending,
    useCallback(() => version, []),
    useCallback(() => 0, []),
  );

  const placeholders = [...pendingCreates.values()]
    .filter((pending) => pending.channel.type === type)
    .map((pending) => pending.channel);

  const pendingIds = new Set<string>([
    ...placeholders.map((channel) => channel.id),
    ...[...pendingDeletes].filter(([, deletedType]) => deletedType === type).map(([channelId]) => channelId),
  ]);

  return { channels: [...(fetched ?? []), ...placeholders], pendingIds, loading: isLoading };
}

export function useVoiceChannels() {
  return useChannels(ChannelType.VOICE);
}

export function useTextChannels() {
  return useChannels(ChannelType.TEXT);
}
