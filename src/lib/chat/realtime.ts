'use client';

import type { ChatEvent } from '@/lib/chat/signal';

/**
 * Uma conexão SSE por aba compartilhada por todos os consumidores (lista de
 * mensagens, badge de não lidas na sidebar) — mesmo padrão de
 * useChannelPresence.ts. A conexão fica de pé enquanto qualquer um estiver
 * inscrito, o que na prática cobre a seção /channels inteira (ver §6.2 da
 * RFC-008): a sidebar mantém pelo menos um inscrito (o badge) o tempo todo.
 */

type Listener = (event: ChatEvent) => void;
type ResyncListener = () => void;

const listeners = new Set<Listener>();
const resyncListeners = new Set<ResyncListener>();

let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let hadConnection = false;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function scheduleReconnect() {
  if (reconnectTimer || listeners.size === 0) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (source || listeners.size === 0) return;

  const stream = new EventSource('/api/chat/events');
  source = stream;

  stream.onopen = () => {
    reconnectAttempts = 0;
    // Só reconcilia numa reconexão de verdade (queda + volta) — na primeira
    // conexão da aba, useChatMessages já carrega o estado inicial sozinho.
    if (hadConnection) resyncListeners.forEach((listener) => listener());
    hadConnection = true;
  };

  stream.onmessage = (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data) as ChatEvent;
      listeners.forEach((listener) => listener(payload));
    } catch {
      // Frame corrompido não deve derrubar o stream — o próximo corrige.
    }
  };

  // O EventSource nativo reconecta sozinho, mas sem backoff — fechar e
  // reagendar aqui evita rajada contra o servidor.
  stream.onerror = () => {
    stream.close();
    if (source === stream) source = null;
    scheduleReconnect();
  };
}

function disconnect() {
  source?.close();
  source = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  hadConnection = false;
}

export function subscribeToChatConnection(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/** Dispara depois que a conexão caiu e voltou — sinal pra quem tem estado local reconciliar. */
export function subscribeToChatResync(listener: ResyncListener): () => void {
  resyncListeners.add(listener);
  return () => resyncListeners.delete(listener);
}
