'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

/**
 * O SSE avisa rápido quando o processo morre, mas não dá pra depender só dele:
 * no deploy o Railway sobe o container novo antes de derrubar o antigo, então o
 * stream pode continuar pendurado no processo velho (respondendo ping) por um
 * bom tempo depois de o container novo já estar servindo todo o resto. Cada
 * poll é uma requisição HTTP nova, roteada pro container que está no ar AGORA —
 * é o que garante a detecção mesmo com o stream sobrevivendo ao deploy.
 */
const POLL_INTERVAL_MS = 45_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const listeners = new Set<() => void>();

// null = ainda não recebemos nenhum commit nessa aba. Guarda o PRIMEIRO commit
// visto como baseline — não necessariamente o commit "certo", só o que essa
// aba já está rodando. Qualquer commit diferente chegando depois é sinal de
// deploy novo enquanto a aba ficou aberta.
let baselineCommit: string | null = null;
let updateAvailable = false;

let source: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function notifyAll() {
  listeners.forEach((notify) => notify());
}

function applyCommit(commit: string) {
  // Sem RAILWAY_GIT_COMMIT_SHA (dev local, self-host fora do Railway) o
  // servidor sempre manda "" — nunca deve acender o aviso.
  if (!commit || updateAvailable) return;

  if (baselineCommit === null) {
    baselineCommit = commit;
    return;
  }
  if (commit === baselineCommit) return;

  updateAvailable = true;
  notifyAll();
  // O aviso não volta atrás — não há mais nada a observar até a página recarregar.
  teardown();
}

async function pollOnce() {
  try {
    // Sem no-store o navegador pode servir a resposta anterior do próprio
    // cache e o commit novo nunca chegaria aqui.
    const response = await fetch('/api/version', { cache: 'no-store' });
    if (!response.ok) return;
    const { commit } = (await response.json()) as { commit: string };
    applyCommit(commit);
  } catch {
    // Rede caiu: tenta de novo no próximo tick.
  }
}

function startPolling() {
  if (pollTimer || listeners.size === 0) return;

  pollTimer = setInterval(() => {
    if (document.hidden || listeners.size === 0) return;
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer || listeners.size === 0 || updateAvailable) return;

  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (source || listeners.size === 0 || updateAvailable) return;

  const stream = new EventSource('/api/version/events');
  source = stream;

  stream.onopen = () => {
    reconnectAttempts = 0;
  };

  stream.onmessage = (event) => {
    try {
      const { commit } = JSON.parse(event.data) as { commit: string };
      applyCommit(commit);
    } catch {
      // Frame corrompido não deve derrubar o stream — o próximo corrige.
    }
  };

  // Deploy que derruba o processo cai aqui: conferir na hora é o caminho rápido
  // (segundos). O poll periódico é que cobre o caso oposto, do stream que
  // sobrevive ao deploy.
  stream.onerror = () => {
    stream.close();
    if (source === stream) source = null;
    void pollOnce();
    scheduleReconnect();
  };
}

function teardown() {
  source?.close();
  source = null;
  stopPolling();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  if (!updateAvailable) {
    connect();
    startPolling();
  }

  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) teardown();
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || listeners.size === 0 || updateAvailable) return;

    // Voltar pra aba é o momento mais provável de ter perdido um deploy —
    // confere na hora, sem esperar o próximo tick do poll.
    void pollOnce();

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

function getSnapshot() {
  return updateAvailable;
}

function getServerSnapshot() {
  return false;
}

/** true assim que o servidor reportar um commit diferente do que essa aba carregou. */
export function useAppVersion(): { updateAvailable: boolean } {
  const { status } = useSession();
  const authenticated = status === 'authenticated';

  const subscribeIfAuthenticated = useCallback(
    (notify: () => void) => (authenticated ? subscribe(notify) : () => {}),
    [authenticated]
  );

  const updateAvailable = useSyncExternalStore(subscribeIfAuthenticated, getSnapshot, getServerSnapshot);

  return { updateAvailable: authenticated && updateAvailable };
}
