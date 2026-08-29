'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import MessageItem, { MessageItemSkeleton } from './MessageItem';
import { useUnreadDivider } from './useUnreadDivider';
import { HugeIcon } from '@/components/HugeIcon';
import type { ClientMessage } from './types';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_THRESHOLD_PX = 80;
const LOAD_OLDER_THRESHOLD_PX = 300;

/** Linha só à esquerda + rótulo — layout assimétrico do design (Chat de Mensagens.dc.html), não o divisor centrado convencional. */
function UnreadDivider() {
  return (
    <div className="mb-4 mt-2.5 flex items-center gap-2.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-destructive">Novas mensagens</span>
      <div className="h-px flex-1 bg-destructive" />
    </div>
  );
}

/** De cima pra baixo, mais antiga primeiro (mesma ordem do carregamento real). */
const SKELETON_MESSAGES: { lines: string[]; grouped?: boolean }[] = [
  { lines: ['62%', '38%'] },
  { lines: ['45%'], grouped: true },
  { lines: ['70%'] },
  { lines: ['50%', '30%'] },
  { lines: ['40%'], grouped: true },
  { lines: ['25%'], grouped: true },
  { lines: ['80%'] },
  { lines: ['55%'], grouped: true },
  { lines: ['65%', '20%'] },
];

/** Mesmo container/scroll do MessageList real (ver componente abaixo) — troca só o conteúdo por placeholders, pra não pular o layout quando a página carrega de verdade. */
export function MessageListSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-end overflow-hidden px-6 py-5 animate-pulse">
        {SKELETON_MESSAGES.map((message, index) => (
          <div key={index} className={cn(index > 0 && (message.grouped ? 'mt-px' : 'mt-5'))}>
            <MessageItemSkeleton grouped={message.grouped} lines={message.lines} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MessageList({
  messages,
  loadingInitial,
  loadingOlder,
  hasMore,
  onLoadOlder,
  currentUserId,
  canDeleteAny,
  onReply,
  onDelete,
  onImageClick,
  onRetry,
  onDiscard,
}: {
  messages: ClientMessage[];
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  currentUserId: string | null;
  canDeleteAny: boolean;
  onReply: (message: ClientMessage) => void;
  onDelete: (message: ClientMessage) => void;
  onImageClick: (image: NonNullable<ClientMessage['image']>) => void;
  onRetry: (clientNonce: string) => void;
  onDiscard: (clientNonce: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [showNewPill, setShowNewPill] = useState(false);
  const pendingPrependRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevMessageCountRef = useRef(0);
  const isInitialRenderRef = useRef(true);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());

  const { dividerMessageId } = useUnreadDivider({ messages, loadingInitial, atBottom, currentUserId });

  const updateAtBottom = useCallback((value: boolean) => {
    atBottomRef.current = value;
    setAtBottom(value);
  }, []);

  const handleLoadOlder = useCallback(() => {
    const el = scrollRef.current;
    if (el) pendingPrependRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    onLoadOlder();
  }, [onLoadOlder]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
    updateAtBottom(nearBottom);
    if (nearBottom) setShowNewPill(false);
    if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX && hasMore && !loadingOlder) handleLoadOlder();
  }, [hasMore, loadingOlder, handleLoadOlder, updateAtBottom]);

  // Âncora de scroll: corrige a posição ao prepender página antiga, faz
  // scroll pro fundo na primeira carga e em mensagem nova só se já estava no
  // fundo — senão mostra o pill "novas mensagens" (ver §8.1 da RFC-008).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pendingPrependRef.current) {
      const pending = pendingPrependRef.current;
      el.scrollTop = pending.scrollTop + (el.scrollHeight - pending.scrollHeight);
      pendingPrependRef.current = null;
      prevMessageCountRef.current = messages.length;
      return;
    }

    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (isInitialRenderRef.current) {
      if (messages.length === 0) return;
      isInitialRenderRef.current = false;
      el.scrollTop = el.scrollHeight;
      updateAtBottom(true);
      return;
    }

    if (grew) {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
      else setShowNewPill(true);
    }
  }, [messages, updateAtBottom]);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) messageRefs.current.set(id, el);
    else messageRefs.current.delete(id);
  }, []);

  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-primary/10');
    setTimeout(() => el.classList.remove('bg-primary/10'), 1200);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updateAtBottom(true);
    setShowNewPill(false);
  }, [updateAtBottom]);

  const renderItems = useMemo(() => {
    return messages.map((message, index) => {
      const prev = messages[index - 1];
      const grouped = Boolean(
        prev &&
        prev.author.id === message.author.id &&
        !message.hasReply &&
        message.id !== dividerMessageId &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <= GROUP_WINDOW_MS,
      );
      return { message, grouped };
    });
  }, [messages, dividerMessageId]);

  if (loadingInitial) return <MessageListSkeleton />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Sem justify-end aqui: combinado com overflow-y-auto, alguns browsers simplesmente não deixam rolar pra
          revelar o conteúdo "antes" do flex-end (bug conhecido de flex-col + justify-end + overflow). O spacer
          com mt-auto abaixo empurra as mensagens pro fundo quando sobra espaço, sem quebrar o scroll quando não sobra. */}
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <HugeIcon name="bubble-chat" size={32} />
            <p className="text-sm">Ainda não tem nenhuma mensagem por aqui. Manda a primeira!</p>
          </div>
        ) : (
          <>
            <div className="mt-auto" />
            {loadingOlder && <div className="py-2 text-center text-xs text-muted-foreground">Carregando mensagens antigas…</div>}
            {renderItems.map(({ message, grouped }, index) => (
              <div key={message.id} className={cn(index > 0 && (grouped ? 'mt-px' : 'mt-5'))}>
                {dividerMessageId === message.id && <UnreadDivider />}
                <MessageItem
                  message={message}
                  grouped={grouped}
                  currentUserId={currentUserId}
                  canDelete={message.author.id === currentUserId || canDeleteAny}
                  onReply={onReply}
                  onDelete={onDelete}
                  onImageClick={onImageClick}
                  onReplyPreviewClick={scrollToMessage}
                  onRetry={(m) => m.clientNonce && onRetry(m.clientNonce)}
                  onDiscard={(m) => m.clientNonce && onDiscard(m.clientNonce)}
                  registerRef={registerRef}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {showNewPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg',
          )}
        >
          <HugeIcon name="arrow-down-01" size={13} />
          Novas mensagens
        </button>
      )}
    </div>
  );
}
