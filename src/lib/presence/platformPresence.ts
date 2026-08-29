/**
 * Presença geral da plataforma (quem está online/away/offline), independente
 * de estar num canal de voz — não confundir com src/lib/rtc/presence.ts, que
 * é presença dentro de uma sala LiveKit.
 *
 * Estado em memória no processo Node, mesmo padrão do cache de
 * src/lib/rtc/presence.ts. Não sobrevive a restart/deploy e não é
 * compartilhado entre instâncias — aceitável pro self-host atual (nó único).
 */

/** Sem request "de verdade" (navegação/API) há mais de 5min, mas a aba segue aberta. */
const AWAY_THRESHOLD_MS = 5 * 60 * 1000;
/** ~2 ciclos do heartbeat client-side (20s) + folga pra hiccup de rede, antes de assumir aba fechada. */
const OFFLINE_GRACE_MS = 50_000;

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface PlatformPresenceUser {
  id: string;
  username: string;
  avatar: string;
  activeStatus: PresenceStatus;
  groups: string[];
  /**
   * Desde quando a pessoa está ausente/offline (ver resolveAwaySince) — só
   * existe nesses dois status; enquanto online, vem undefined. Persistido no
   * doc do usuário (ver src/lib/presence/lastActiveAt.ts), sobrevive a
   * restart, ao contrário do resto deste módulo.
   */
  lastActiveAt?: string;
  /** Bloqueado de enviar mensagens no canal de texto (ver POST /api/chat/block). */
  chatBlocked: boolean;
  /** Canal de voz em que a pessoa está agora, se houver (ver loadActiveVoiceChannels em /api/presence/users). */
  voiceChannelId?: string;
}

interface PresenceEntry {
  /** Último request real (navegação de página ou chamada de API autenticada via middleware). */
  lastActiveAt: number;
  /** Último sinal de vida (request real OU heartbeat) — prova que a aba segue aberta. */
  lastSeenAt: number;
}

const globalForPresence = globalThis as unknown as { __platformPresenceStore?: Map<string, PresenceEntry> };
const store = (globalForPresence.__platformPresenceStore ??= new Map<string, PresenceEntry>());

/** Request autenticada de verdade — reseta o relógio de away (chamado a partir do middleware). */
export function touchActivity(userId: string): void {
  const now = Date.now();
  store.set(userId, { lastActiveAt: now, lastSeenAt: now });
}

/** Heartbeat client-side — só prova que a aba segue aberta, não conta como atividade real. */
export function touchHeartbeat(userId: string): void {
  const now = Date.now();
  const entry = store.get(userId);
  store.set(userId, { lastActiveAt: entry?.lastActiveAt ?? now, lastSeenAt: now });
}

/** Fechou a janela (beacon no unload) — força offline sem esperar o grace period. */
export function markOffline(userId: string): void {
  store.delete(userId);
}

export function getStatus(userId: string, now: number = Date.now()): PresenceStatus {
  const entry = store.get(userId);
  if (!entry || now - entry.lastSeenAt > OFFLINE_GRACE_MS) return 'offline';
  if (now - entry.lastActiveAt > AWAY_THRESHOLD_MS) return 'away';
  return 'online';
}

interface AwaySinceEntry {
  /** null enquanto online; ISO de quando deixou de estar online, entre isso e a volta pra online. */
  awaySince: string | null;
}

const globalForAwaySince = globalThis as unknown as { __platformAwaySinceStore?: Map<string, AwaySinceEntry> };
const awaySinceStore = (globalForAwaySince.__platformAwaySinceStore ??= new Map<string, AwaySinceEntry>());

export interface AwaySinceResult {
  awaySince: string | null;
  /** Só diferente de null quando essa chamada detectou uma transição que precisa virar escrita durável no Firestore (ver lastActiveAt.ts). */
  persistAction: 'set' | 'clear' | null;
}

/**
 * Rastreia a transição online -> away/offline (e a volta) pra alimentar a
 * label "há X minutos" da sidebar de usuários: o valor não é "última
 * atividade", é "desde quando está ausente/offline" — só existe entre o
 * momento em que a pessoa deixa de estar online e o momento em que volta.
 * Chamada a cada leitura de presença (poll da sidebar), que é quem detecta a
 * transição — não há um timer/cron dedicado pra isso.
 */
export function resolveAwaySince(
  userId: string,
  status: PresenceStatus,
  persistedAwaySince: string | undefined,
  now: number = Date.now(),
): AwaySinceResult {
  const prev = awaySinceStore.get(userId);

  if (status === 'online') {
    const hadValue = prev ? prev.awaySince !== null : Boolean(persistedAwaySince);
    awaySinceStore.set(userId, { awaySince: null });
    return { awaySince: null, persistAction: hadValue ? 'clear' : null };
  }

  // Já sabíamos que essa pessoa está away/offline (de uma leitura anterior
  // nesse processo, com awaySince não-nulo) — mantém a marca original, não
  // reinicia a contagem só porque saiu de away e foi pra offline (ou
  // vice-versa). Se `prev` existe mas com awaySince null, a última leitura
  // viu a pessoa online — essa é uma transição nova de verdade, cai pro
  // fallback abaixo (sem esse checável o label "há X min" some pra sempre
  // pra quem já foi visto online neste processo, mesmo depois de cair).
  if (prev && prev.awaySince !== null) return { awaySince: prev.awaySince, persistAction: null };

  // Primeira vez vendo essa transição nesse processo — herda o valor
  // persistido em vez de reiniciar a contagem do zero, se tiver um (ex:
  // logo após um restart, alguém que já estava away antes). Senão, marca o
  // instante real em que a pessoa cruzou o limiar (não "quando esse poll
  // rodou") — usar `now` aqui faria todo mundo que cruza o limiar dentro da
  // mesma janela de poll (20s) compartilhar o mesmo awaySince.
  const awaySince = persistedAwaySince ?? new Date(transitionTimestamp(userId, status, now)).toISOString();
  awaySinceStore.set(userId, { awaySince });
  return { awaySince, persistAction: persistedAwaySince ? null : 'set' };
}

/** Instante em que a pessoa efetivamente cruzou o limiar do status atual, a partir do próprio relógio dela — não do momento em que esse poll observou. */
function transitionTimestamp(userId: string, status: PresenceStatus, now: number): number {
  const entry = store.get(userId);
  if (!entry) return now;
  if (status === 'offline') return entry.lastSeenAt + OFFLINE_GRACE_MS;
  if (status === 'away') return entry.lastActiveAt + AWAY_THRESHOLD_MS;
  return now;
}
