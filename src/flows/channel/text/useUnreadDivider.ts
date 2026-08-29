'use client';

import { useEffect, useRef, useState } from 'react';
import { markChatRead } from '@/hooks/useChatUnread';
import type { ClientMessage } from './types';

interface ReadState {
  lastReadMessageId: string | null;
  unreadCount: number;
}

/**
 * Divisor de "novas mensagens não lidas" (ver §8.2 da RFC-008). A âncora é
 * congelada na montagem — computada uma vez a partir do lastReadMessageId
 * buscado no mount, e nunca recalculada a partir dele de novo, senão ela
 * persegue o scroll. Reaparece só quando uma mensagem nova chega enquanto
 * você está rolado pra cima e não há divisor na tela.
 *
 * Limitação aceita: se lastReadMessageId for mais antigo que a primeira
 * página carregada (backlog grande), a âncora cai no topo do que já está
 * carregado em vez do ponto exato — carregar páginas antigas só pra achar o
 * ponto certo não valia o custo aqui (ver relatório final da implementação).
 */
export function useUnreadDivider(params: {
  messages: ClientMessage[];
  loadingInitial: boolean;
  atBottom: boolean;
  currentUserId: string | null;
}) {
  const { messages, loadingInitial, atBottom, currentUserId } = params;

  const [dividerMessageId, setDividerMessageId] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const anchoredRef = useRef(false);
  const dismissedRef = useRef(false);
  const prevLastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const onVisibilityChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Âncora inicial: espera a primeira página carregar, busca o estado de
  // leitura salvo e computa o divisor uma única vez.
  useEffect(() => {
    if (anchoredRef.current || loadingInitial || messages.length === 0) return;
    anchoredRef.current = true;

    (async () => {
      try {
        const response = await fetch('/api/chat/read');
        if (!response.ok) return;
        const data = (await response.json()) as ReadState;
        if (data.unreadCount <= 0) return;

        const index = data.lastReadMessageId ? messages.findIndex((m) => m.id === data.lastReadMessageId) : -1;
        if (index !== -1) {
          const next = messages[index + 1];
          if (next) setDividerMessageId(next.id);
        } else {
          // lastReadMessageId nulo ou fora da janela carregada: melhor esforço no topo.
          setDividerMessageId(messages[0]?.id ?? null);
        }
      } catch {
        // Sem divisor em caso de falha — não é crítico o suficiente pra travar a lista.
      }
    })();
  }, [loadingInitial, messages]);

  // Chegou no fundo com a aba visível: marca lido e o divisor some com fade
  // (o caller decide o fade via dividerMessageId virando null).
  useEffect(() => {
    if (!atBottom || !visible || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.id === prevLastIdRef.current && dismissedRef.current) return;

    prevLastIdRef.current = latest.id;
    dismissedRef.current = true;
    setDividerMessageId(null);
    if (latest.status === 'sent') markChatRead(latest.id);
  }, [atBottom, visible, messages]);

  // Mensagem nova chegando enquanto rolado pra cima: se não há divisor na
  // tela, ancora um novo antes dela (ver §8.2).
  const lastMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.id === lastMessageIdRef.current) return;
    const isNewArrival = lastMessageIdRef.current !== null;
    lastMessageIdRef.current = latest.id;

    if (!isNewArrival) return;
    if (atBottom || dividerMessageId !== null) return;
    if (latest.author.id === currentUserId) return;

    setDividerMessageId(latest.id);
    dismissedRef.current = false;
  }, [messages, atBottom, dividerMessageId, currentUserId]);

  return { dividerMessageId };
}
