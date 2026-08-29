'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useVoice } from '@/providers/VoiceProvider';

/** Bem abaixo dos 5min de away (AWAY_THRESHOLD_MS em platformPresence.ts) — só precisa provar que a aba segue aberta. */
const HEARTBEAT_INTERVAL_MS = 20_000;

// Dentro da experiência de canais (hoje a própria home — só /admin fica de
// fora) o usuário fica parado sem navegar boa parte do tempo (ouvindo voz,
// assistindo uma live) — sem isso ele cairia pra "away" depois de
// AWAY_THRESHOLD_MS mesmo ativo, porque só navegação conta como atividade
// real (ver sendActivity abaixo). Nessas rotas o próprio heartbeat periódico
// passa a valer como atividade real, forçando online enquanto a aba seguir
// visível ali.
function isForceOnlineRoute(pathname: string) {
  return !pathname.startsWith('/admin');
}

function sendHeartbeat() {
  fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {});
}

// "Atividade real" (distinta do heartbeat, que só prova que a aba está
// aberta) precisava vir do middleware — um fetch interno pra /api/presence/activity
// disparado via event.waitUntil a cada request. Esse self-fetch (edge
// middleware batendo de volta no próprio domínio público) nunca chega a
// completar no self-host atual (Railway/Docker): lastActiveAt nunca era
// persistido pra ninguém. Navegar é o sinal de atividade real mais próximo
// que dá pra capturar no client, e usa o mesmo fetch same-origin que o
// heartbeat já prova funcionar.
function sendActivity() {
  fetch('/api/presence/activity', { method: 'POST' }).catch(() => {});
}

function sendOfflineBeacon() {
  navigator.sendBeacon?.('/api/presence/offline');
}

/** Mantém o usuário logado como "presente" (heartbeat) enquanto a aba está aberta e visível. */
export function usePlatformPresenceHeartbeat(): void {
  const { status } = useSession();
  const pathname = usePathname();
  const { status: voiceStatus } = useVoice();
  const authenticated = status === 'authenticated';
  // Refs (não state): o tick do interval precisa ler rota e status de voz
  // atuais sem recriar o interval a cada navegação/conexão.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const inVoiceCallRef = useRef(voiceStatus === 'connected');
  inVoiceCallRef.current = voiceStatus === 'connected';

  useEffect(() => {
    if (!authenticated) return;

    function tick() {
      // Aba escondida normalmente pausa o heartbeat (usuário nem está
      // olhando) — mas quem está numa chamada de voz continua "presente" de
      // verdade mesmo com a aba em segundo plano ou ensurdecido, então aqui
      // o heartbeat segue rodando pra não deixar a pessoa cair pra offline
      // (ver clamp em /api/presence/users, que já nunca deixa isso acontecer,
      // mas sem o heartbeat ela cairia pra "away" bem mais cedo que os 5min
      // combinados).
      if (document.hidden && !inVoiceCallRef.current) return;
      if (isForceOnlineRoute(pathnameRef.current)) sendActivity();
      else sendHeartbeat();
    }

    tick();
    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);

    function handleVisibility() {
      if (!document.hidden) tick();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', sendOfflineBeacon);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', sendOfflineBeacon);
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    sendActivity();
  }, [authenticated, pathname]);
}
