'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { subscribeToChatConnection, subscribeToChatResync } from '@/lib/chat/realtime';
import type { ChatEvent } from '@/lib/chat/signal';
import { UNREAD_COUNT_DISPLAY_CAP } from '@/lib/chat/channel';

interface UnreadState {
  count: number;
  mentionCount: number;
  loading: boolean;
}

const LOADING_STATE: UnreadState = { count: 0, mentionCount: 0, loading: true };

// Um canal de texto agora, não um único global (ver ADR-0002) — mesmo padrão
// de Map por canal do useChannelPresence.ts, só que aqui cada entrada busca
// sua própria contagem em vez de vir de um snapshot único.
const perChannel = new Map<string, UnreadState>();
const refCounts = new Map<string, number>();
const fetchedForUserId = new Map<string, string>();
const listeners = new Set<() => void>();
let currentUserId: string | null = null;

function notifyAll() {
  listeners.forEach((listener) => listener());
}

function setChannelState(channelId: string, next: UnreadState) {
  perChannel.set(channelId, next);
  notifyAll();
}

async function load(channelId: string) {
  try {
    const response = await fetch(`/api/chat/read?channelId=${encodeURIComponent(channelId)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { unreadCount: number; mentionUnreadCount: number };
    setChannelState(channelId, { count: data.unreadCount, mentionCount: data.mentionUnreadCount, loading: false });
  } catch {
    // Rede caiu: mantém o último valor conhecido.
  }
}

function handleEvent(event: ChatEvent) {
  if (!currentUserId) return;
  if (event.type !== 'message' && event.type !== 'deleted') return;
  // Ninguém com o badge desse canal montado agora — o próximo attach já busca
  // o valor certo, não precisa acumular evento de canal que ninguém vê.
  if (!refCounts.has(event.channelId)) return;

  if (event.type === 'message') {
    if (event.message.author.id === currentUserId) return;
    const current = perChannel.get(event.channelId) ?? LOADING_STATE;
    const mentioned = event.message.mentions.some((mention) => mention.id === currentUserId);
    setChannelState(event.channelId, {
      count: current.count + 1,
      mentionCount: current.mentionCount + (mentioned ? 1 : 0),
      loading: false,
    });
    return;
  }

  // 'deleted': não dá pra saber sem estado extra se a mensagem apagada estava
  // não lida — um refetch é barato perto da frequência de exclusões e mantém
  // o número exato (a query do servidor já ignora mensagens apagadas).
  void load(event.channelId);
}

let unsubscribeConnection: (() => void) | null = null;
let unsubscribeResync: (() => void) | null = null;
let globalRefCount = 0;

function attach(userId: string, channelId: string): () => void {
  currentUserId = userId;
  if (fetchedForUserId.get(channelId) !== userId) {
    fetchedForUserId.set(channelId, userId);
    void load(channelId);
  }

  refCounts.set(channelId, (refCounts.get(channelId) ?? 0) + 1);

  globalRefCount += 1;
  if (globalRefCount === 1) {
    unsubscribeConnection = subscribeToChatConnection(handleEvent);
    unsubscribeResync = subscribeToChatResync(() => {
      for (const watchedChannelId of refCounts.keys()) void load(watchedChannelId);
    });
  }

  return () => {
    const next = (refCounts.get(channelId) ?? 1) - 1;
    if (next <= 0) {
      refCounts.delete(channelId);
      perChannel.delete(channelId);
      fetchedForUserId.delete(channelId);
    } else {
      refCounts.set(channelId, next);
    }

    globalRefCount -= 1;
    if (globalRefCount === 0) {
      unsubscribeConnection?.();
      unsubscribeResync?.();
      unsubscribeConnection = null;
      unsubscribeResync = null;
    }
  };
}

/** Marca lido otimisticamente (zera o badge na hora) e persiste no servidor — chamada por useUnreadDivider ao chegar no fundo com a aba visível. */
export function markChatRead(channelId: string, messageId: string): void {
  setChannelState(channelId, { count: 0, mentionCount: 0, loading: false });
  fetch('/api/chat/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, messageId }),
  }).catch(() => {});
}

function formatCount(count: number): string {
  return count > UNREAD_COUNT_DISPLAY_CAP ? `${UNREAD_COUNT_DISPLAY_CAP}+` : String(count);
}

/** Contagem de não lidas de um canal de texto — compartilhada entre a badge da sidebar e a página do chat via um único fetch/conexão por canal. */
export function useChatUnread(channelId: string | null): {
  count: number;
  displayCount: string;
  mentionCount: number;
  mentionDisplayCount: string;
  loading: boolean;
} {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || !channelId) return undefined;
    return attach(userId, channelId);
  }, [userId, channelId]);

  const subscribe = useCallback((notify: () => void) => {
    listeners.add(notify);
    return () => listeners.delete(notify);
  }, []);

  const getSnapshot = useCallback(
    () => (channelId ? (perChannel.get(channelId) ?? LOADING_STATE) : LOADING_STATE),
    [channelId],
  );
  const getServerSnapshot = useCallback(() => LOADING_STATE, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    count: snapshot.count,
    displayCount: formatCount(snapshot.count),
    mentionCount: snapshot.mentionCount,
    mentionDisplayCount: formatCount(snapshot.mentionCount),
    loading: snapshot.loading,
  };
}
