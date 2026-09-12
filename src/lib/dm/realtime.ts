'use client';

import type { DmEvent } from '@/lib/dm/signal';

/**
 * Cópia estrutural de lib/chat/realtime.ts, sobre /api/dm/events — mesmo
 * padrão de EventSource singleton por aba, com reconexão por backoff
 * exponencial. Conexão SEPARADA da do chat de canal: os dois barramentos
 * (broadcast vs. direcionado) não se misturam (ver lib/dm/signal.ts).
 */

type Listener = (event: DmEvent) => void;
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

  const stream = new EventSource('/api/dm/events');
  source = stream;

  stream.onopen = () => {
    reconnectAttempts = 0;
    // Só reconcilia numa reconexão de verdade (queda + volta) — na primeira
    // conexão da aba, useDirectConversations/useDirectMessages já carregam o
    // estado inicial sozinhos.
    if (hadConnection) resyncListeners.forEach((listener) => listener());
    hadConnection = true;
  };

  stream.onmessage = (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data) as DmEvent;
      listeners.forEach((listener) => listener(payload));
    } catch {
      // Frame corrompido não deve derrubar o stream — o próximo corrige.
    }
  };

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

export function subscribeToDmConnection(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/** Dispara depois que a conexão caiu e voltou — sinal pra quem tem estado local reconciliar. */
export function subscribeToDmResync(listener: ResyncListener): () => void {
  resyncListeners.add(listener);
  return () => resyncListeners.delete(listener);
}
