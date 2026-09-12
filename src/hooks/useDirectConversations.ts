'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { subscribeToDmConnection, subscribeToDmResync } from '@/lib/dm/realtime';
import type { DmEvent } from '@/lib/dm/signal';

export interface DirectConversationSummary {
  id: string;
  otherParticipant: { id: string; username: string; avatar: string };
  lastMessage: { authorId: string; content: string | null; hasAttachment: boolean; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

interface DirectConversationsState {
  conversations: DirectConversationSummary[];
  loading: boolean;
}

const LOADING_STATE: DirectConversationsState = { conversations: [], loading: true };

let state: DirectConversationsState = LOADING_STATE;
let currentUserId: string | null = null;
let fetchedForUserId: string | null = null;
const listeners = new Set<() => void>();

function setState(next: DirectConversationsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function sortByUpdatedAt(conversations: DirectConversationSummary[]): DirectConversationSummary[] {
  return [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function load() {
  try {
    const response = await fetch('/api/dm/conversations');
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: DirectConversationSummary[] };
    setState({ conversations: data.conversations, loading: false });
  } catch {
    // Rede caiu: mantém o último valor conhecido.
  }
}

function handleEvent(event: DmEvent) {
  if (!currentUserId) return;

  if (event.type === 'message') {
    const index = state.conversations.findIndex((c) => c.id === event.conversationId);
    if (index === -1) {
      // Conversa nova (alguém te chamou pela primeira vez) — não dá pra
      // montar a linha sem estado extra (identidade do outro lado), um
      // refetch é barato nessa escala.
      void load();
      return;
    }

    const isMine = event.message.author.id === currentUserId;
    const conversations = state.conversations.slice();
    conversations[index] = {
      ...conversations[index],
      lastMessage: {
        authorId: event.message.author.id,
        content: event.message.content,
        hasAttachment: Boolean(event.message.attachment),
        createdAt: event.message.createdAt,
      },
      unreadCount: isMine ? conversations[index].unreadCount : conversations[index].unreadCount + 1,
      updatedAt: event.message.createdAt,
    };
    setState({ conversations: sortByUpdatedAt(conversations), loading: false });
    return;
  }

  if (event.type === 'deleted') {
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
    unsubscribeConnection = subscribeToDmConnection(handleEvent);
    unsubscribeResync = subscribeToDmResync(() => void load());
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

/** Marca lido otimisticamente (zera o badge da conversa na hora) e persiste no servidor — chamada por useUnreadDivider dentro de uma DM. */
export function markDmRead(conversationId: string, messageId: string): void {
  const index = state.conversations.findIndex((c) => c.id === conversationId);
  if (index !== -1 && state.conversations[index].unreadCount !== 0) {
    const conversations = state.conversations.slice();
    conversations[index] = { ...conversations[index], unreadCount: 0 };
    setState({ conversations, loading: false });
  }

  fetch('/api/dm/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, messageId }),
  }).catch(() => {});
}

/** Some da lista na hora (otimista) e pede pro servidor esconder de verdade — não apaga mensagem nem afeta o outro participante. */
export function hideDmConversation(conversationId: string): void {
  const conversations = state.conversations.filter((c) => c.id !== conversationId);
  if (conversations.length !== state.conversations.length) setState({ conversations, loading: false });

  fetch(`/api/dm/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {});
}

/** Refetch manual — usado depois de reabrir uma conversa escondida pelo picker de nova DM, já que aquele POST não passa pelo canal de eventos (SSE) que dispara `load()` sozinho. */
export function refreshDirectConversations(): void {
  void load();
}

function getSnapshot(): DirectConversationsState {
  return state;
}

function getServerSnapshot(): DirectConversationsState {
  return LOADING_STATE;
}

/** Lista de conversas do usuário — alimenta o rail de DM e a badge agregada de não lidas. */
export function useDirectConversations(): DirectConversationsState & { totalUnread: number } {
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

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const totalUnread = snapshot.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  return { conversations: snapshot.conversations, loading: snapshot.loading, totalUnread };
}
