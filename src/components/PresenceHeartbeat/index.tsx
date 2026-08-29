'use client';

import { usePlatformPresenceHeartbeat } from '@/hooks/usePlatformPresenceHeartbeat';

/** Sem UI — só mantém o heartbeat de presença rodando enquanto a plataforma está aberta. */
export default function PresenceHeartbeat() {
  usePlatformPresenceHeartbeat();
  return null;
}
