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

let state: UnreadState = LOADING_STATE;
let currentUserId: string | null = null;
let fetchedForUserId: string | null = null;
const listeners = new Set<() => void>();

function setState(next: UnreadState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function load() {
  try {
    const response = await fetch('/api/chat/read');
    if (!response.ok) return;
    const data = (await response.json()) as { unreadCount: number; mentionUnreadCount: number };
    setState({ count: data.unreadCount, mentionCount: data.mentionUnreadCount, loading: false });
  } catch {
    // Rede caiu: mantém o último valor conhecido.
  }
}

function handleEvent(event: ChatEvent) {
  if (!currentUserId) return;

  if (event.type === 'message') {
    if (event.message.author.id === currentUserId) return;
    const mentioned = event.message.mentions.some((mention) => mention.id === currentUserId);
    setState({ count: state.count + 1, mentionCount: state.mentionCount + (mentioned ? 1 : 0), loading: false });
    return;
  }

  if (event.type === 'deleted') {
    // Não dá pra saber sem estado extra se a mensagem apagada estava não
    // lida — um refetch é barato perto da frequência de exclusões e mantém
    // o número exato (a query do servidor já ignora mensagens apagadas).
    void load();
  }
}

let unsubscribeConnection: (() => void) | null = null;
let unsubscribeResync: (() => void) | null = null;
let refCount = 0;

function attach(userId: string): () => void {
  currentUserId = userId;
  if (fetchedForUserId !== userId) {
    fetchedForUserId = userId;
    void load();
  }

  refCount += 1;
  if (refCount === 1) {
    unsubscribeConnection = subscribeToChatConnection(handleEvent);
    unsubscribeResync = subscribeToChatResync(() => void load());
  }

  return () => {
    refCount -= 1;
    if (refCount === 0) {
      unsubscribeConnection?.();
      unsubscribeResync?.();
      unsubscribeConnection = null;
      unsubscribeResync = null;
    }
  };
}

/** Marca lido otimisticamente (zera o badge na hora) e persiste no servidor — chamada por useUnreadDivider ao chegar no fundo com a aba visível. */
export function markChatRead(messageId: string): void {
  setState({ count: 0, mentionCount: 0, loading: false });
  fetch('/api/chat/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  }).catch(() => {});
}

function formatCount(count: number): string {
  return count > UNREAD_COUNT_DISPLAY_CAP ? `${UNREAD_COUNT_DISPLAY_CAP}+` : String(count);
}

/** Contagem de não lidas do canal de texto — compartilhada entre a badge da sidebar e a página do chat via um único fetch/conexão. */
export function useChatUnread(): {
  count: number;
  displayCount: string;
  mentionCount: number;
  mentionDisplayCount: string;
  loading: boolean;
} {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return undefined;
    return attach(userId);
  }, [userId]);

  const subscribe = useCallback((notify: () => void) => {
    listeners.add(notify);
    return () => listeners.delete(notify);
  }, []);

  const getSnapshot = useCallback(() => state, []);
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
