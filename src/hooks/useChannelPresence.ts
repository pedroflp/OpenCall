'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { PresenceParticipant, PresenceSnapshot } from '@/lib/rtc/presence';

/** Só entra em cena quando o SSE cai — enquanto o stream está de pé, presença chega por push. */
const POLL_FALLBACK_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface ChannelPresence {
  participants: PresenceParticipant[];
  loading: boolean;
}

const LOADING_SNAPSHOT: ChannelPresence = { participants: [], loading: true };
const DISABLED_SNAPSHOT: ChannelPresence = { participants: [], loading: false };
const EMPTY_SNAPSHOT: ChannelPresence = { participants: [], loading: false };

/**
 * Uma conexão SSE por aba serve todos os canais, e cada canal guarda seu
 * próprio objeto de snapshot — useSyncExternalStore compara por identidade,
 * então recriar o objeto de um canal que não mudou re-renderizaria a sidebar
 * inteira a cada evento.
 */
const perChannel = new Map<string, ChannelPresence>();
const listeners = new Set<() => void>();

let source: EventSource | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function samePresence(a: PresenceParticipant[], b: PresenceParticipant[]): boolean {
  return (
    a.length === b.length &&
    a.every((participant, index) => {
      const other = b[index];
      return (
        participant.identity === other.identity &&
        participant.name === other.name &&
        participant.avatar === other.avatar &&
        participant.micMuted === other.micMuted &&
        participant.deafened === other.deafened &&
        participant.isStreaming === other.isStreaming
      );
    })
  );
}

function notifyAll() {
  listeners.forEach((notify) => notify());
}

function applySnapshot(snapshot: PresenceSnapshot) {
  let changed = false;

  for (const [channelId, participants] of Object.entries(snapshot)) {
    const current = perChannel.get(channelId);
    if (current && !current.loading && samePresence(current.participants, participants)) continue;
    perChannel.set(channelId, { participants, loading: false });
    changed = true;
  }

  // Canal que sumiu do snapshot esvaziou — sem isso ele ficaria congelado com
  // a última lista conhecida (era assim que os fantasmas apareciam).
  for (const [channelId, current] of perChannel) {
    if (channelId in snapshot) continue;
    if (!current.loading && current.participants.length === 0) continue;
    perChannel.set(channelId, EMPTY_SNAPSHOT);
    changed = true;
  }

  if (changed) notifyAll();
}

async function pollOnce() {
  try {
    const response = await fetch('/api/rtc/presence');
    if (!response.ok) return;
    const { channels } = (await response.json()) as { channels: PresenceSnapshot };
    applySnapshot(channels);
  } catch {
    // Rede caiu: mantém o último snapshot e tenta de novo no próximo tick.
  }
}

function startPollFallback() {
  if (pollTimer || listeners.size === 0) return;

  const tick = () => {
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      if (listeners.size === 0) return;
      if (!document.hidden) await pollOnce();
      if (!source) tick();
    }, POLL_FALLBACK_MS);
  };

  void pollOnce();
  tick();
}

function stopPollFallback() {
  if (!pollTimer) return;
  clearTimeout(pollTimer);
  pollTimer = null;
}

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

  const stream = new EventSource('/api/rtc/presence/events');
  source = stream;

  stream.onopen = () => {
    reconnectAttempts = 0;
    stopPollFallback();
  };

  stream.onmessage = (event) => {
    try {
      applySnapshot(JSON.parse(event.data) as PresenceSnapshot);
    } catch {
      // Frame corrompido não deve derrubar o stream — o próximo corrige.
    }
  };

  // O EventSource nativo reconecta sozinho, mas sem backoff e sem desistir de
  // um 401/503 — fechar e reagendar aqui evita a rajada, e o poll segura a
  // presença enquanto o stream não volta.
  stream.onerror = () => {
    stream.close();
    if (source === stream) source = null;
    startPollFallback();
    scheduleReconnect();
  };
}

function disconnect() {
  source?.close();
  source = null;
  stopPollFallback();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  connect();

  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) disconnect();
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || listeners.size === 0) return;
    // Voltar pra aba com o stream caído: reconecta agora em vez de esperar o
    // backoff, que já pode estar em dezenas de segundos.
    if (!source) {
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connect();
    }
  });
}

/**
 * Compatibilidade com quem chamava isso pra forçar releitura depois de uma ação
 * própria (entrar/sair de canal). Com o SSE isso deixou de ser necessário — o
 * servidor empurra a mudança —, mas continua valendo enquanto o stream estiver
 * caído e a presença vier do poll.
 */
export function refreshChannelPresence(_channelId?: string): void {
  if (!source) void pollOnce();
}

/**
 * Presença de quem está no canal antes de entrar. `enabled` false para quem já
 * está conectado: aí o dado ao vivo vem do SDK do LiveKit, não daqui.
 */
export function useChannelPresence(channelId: string, enabled: boolean): ChannelPresence {
  const subscribeToChannel = useCallback(
    (notify: () => void) => (enabled ? subscribe(notify) : () => {}),
    [enabled],
  );

  const getSnapshot = useCallback(
    () => (enabled ? perChannel.get(channelId) ?? LOADING_SNAPSHOT : DISABLED_SNAPSHOT),
    [channelId, enabled],
  );

  const getServerSnapshot = useCallback(
    () => (enabled ? LOADING_SNAPSHOT : DISABLED_SNAPSHOT),
    [enabled],
  );

  return useSyncExternalStore(subscribeToChannel, getSnapshot, getServerSnapshot);
}
