import { ServerError, TrackSource, type ParticipantInfo, type TrackInfo, type WebhookEvent } from 'livekit-server-sdk';
import { livekitApi } from '@/lib/rtc/server';
import { getVoiceChannel, getVoiceChannels } from '@/lib/rtc/channels';

export interface PresenceParticipant {
  identity: string;
  name: string;
  avatar?: string;
  isAdmin: boolean;
  micMuted: boolean;
  deafened: boolean;
  isStreaming: boolean;
  cameraEnabled: boolean;
}

export type PresenceSnapshot = Record<string, PresenceParticipant[]>;

/**
 * Quanto tempo um snapshot lido do LiveKit continua servindo quando NÃO há
 * webhook alimentando o store. É o modo degradado (webhook não configurado no
 * painel do LiveKit): mesma janela de antes, mas agora barata.
 */
const POLL_TTL_MS = 3_000;

/**
 * Com webhook vivo, a lista de quem está em cada canal já é exata. Este resync
 * só existe pra (a) pegar um webhook perdido e (b) atualizar o estado fino que
 * o LiveKit não notifica: mute/unmute de uma track já publicada e o atributo
 * `deafened`. Canal com gente refaz mais rápido porque é justo aí que esse
 * estado muda — e custa ~150ms, contra ~140ms de um canal vazio.
 */
const RESYNC_BUSY_MS = 10_000;
const RESYNC_IDLE_MS = 30_000;

interface Store {
  channels: Map<string, PresenceParticipant[]>;
  /** Última lista de ids de canal de voz vista (ver refreshFromLiveKit) — canal dinâmico, não dá mais pra enumerar de forma síncrona. */
  channelIds: string[];
  refreshedAt: number;
  inFlight: Promise<void> | null;
  hydrated: boolean;
  /** Zero enquanto nenhum webhook válido chegou neste processo — ver webhooksAlive. */
  lastWebhookAt: number;
  listeners: Set<(snapshot: PresenceSnapshot) => void>;
  resyncTimer: ReturnType<typeof setTimeout> | null;
}

const globalForPresence = globalThis as unknown as { __rtcPresenceStore?: Store };
const store: Store = (globalForPresence.__rtcPresenceStore ??= {
  channels: new Map(),
  channelIds: [],
  refreshedAt: 0,
  inFlight: null,
  hydrated: false,
  lastWebhookAt: 0,
  listeners: new Set(),
  resyncTimer: null,
});

/**
 * Uma vez que um webhook válido chegou, o LiveKit está configurado pra
 * notificar este deploy e a membership do store é autoritativa. Não é janela de
 * tempo: um canal pode passar horas sem ninguém entrar ou sair, e isso não
 * significa que o webhook parou de funcionar.
 */
function webhooksAlive(): boolean {
  return store.lastWebhookAt > 0;
}

function parseMetadata(metadata: string): { avatar?: string; isAdmin?: boolean } {
  try {
    return JSON.parse(metadata) as { avatar?: string; isAdmin?: boolean };
  } catch {
    return {};
  }
}

/**
 * Mesma conversão pro que vem de listParticipants e pro corpo de um
 * participant_joined — os dois são ParticipantInfo completos.
 *
 * `previous` cobre o payload que chega sem `name`/`metadata`: nome, avatar e
 * isAdmin são estáveis enquanto a pessoa está na sala, então na ausência do
 * campo o certo é manter o que já se sabe, não cair pro id cru na tela.
 */
function toPresenceParticipant(p: ParticipantInfo, previous?: PresenceParticipant): PresenceParticipant {
  const micTrack = p.tracks.find((track) => track.source === TrackSource.MICROPHONE);
  const screenShareTrack = p.tracks.find((track) => track.source === TrackSource.SCREEN_SHARE);
  const cameraTrack = p.tracks.find((track) => track.source === TrackSource.CAMERA);
  const metadata = p.metadata ? parseMetadata(p.metadata) : null;

  return {
    identity: p.identity,
    name: p.name || previous?.name || p.identity,
    avatar: metadata ? metadata.avatar : previous?.avatar,
    isAdmin: metadata ? Boolean(metadata.isAdmin) : Boolean(previous?.isAdmin),
    micMuted: !micTrack || micTrack.muted,
    deafened: Object.keys(p.attributes).length > 0 ? p.attributes.deafened === '1' : Boolean(previous?.deafened),
    isStreaming: Boolean(screenShareTrack && !screenShareTrack.muted),
    cameraEnabled: Boolean(cameraTrack && !cameraTrack.muted),
  };
}

/**
 * track_published/unpublished descreve UMA track, não o participante inteiro —
 * então altera só a dimensão correspondente, em vez de reconstruir a pessoa a
 * partir de um ParticipantInfo que vem sem nome nem metadata.
 *
 * Nunca adiciona: `track_unpublished` também dispara quando alguém desconecta,
 * e aí chega depois do dropParticipant do /api/rtc/leave — fazer upsert aqui
 * ressuscitava por instantes quem já tinha saído.
 */
function applyTrackChange(channelId: string, identity: string, track: TrackInfo, published: boolean): void {
  const current = store.channels.get(channelId);
  if (!current?.some((participant) => participant.identity === identity)) return;

  const live = published && !track.muted;
  const patch =
    track.source === TrackSource.SCREEN_SHARE
      ? { isStreaming: live }
      : track.source === TrackSource.MICROPHONE
        ? { micMuted: !live }
        : track.source === TrackSource.CAMERA
          ? { cameraEnabled: live }
          : null;
  if (!patch) return;

  setChannel(
    channelId,
    current.map((participant) => (participant.identity === identity ? { ...participant, ...patch } : participant)),
  );
}

function sortParticipants(participants: PresenceParticipant[]): PresenceParticipant[] {
  return [...participants].sort(
    (a, b) => Number(b.isStreaming) - Number(a.isStreaming) || a.identity.localeCompare(b.identity),
  );
}

function same(a: PresenceParticipant[], b: PresenceParticipant[]): boolean {
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
        participant.isStreaming === other.isStreaming &&
        participant.cameraEnabled === other.cameraEnabled
      );
    })
  );
}

/**
 * Ids de canal a enumerar num snapshot: a última lista vista num refresh
 * (store.channelIds) unida com o que já tem entrada no Map — cobre um canal
 * recém-criado que já recebeu um webhook antes do próximo refresh periódico
 * rodar (ver refreshFromLiveKit).
 */
function knownChannelIds(): string[] {
  return Array.from(new Set([...store.channelIds, ...store.channels.keys()]));
}

export function presenceSnapshot(): PresenceSnapshot {
  const snapshot: PresenceSnapshot = {};
  for (const channelId of knownChannelIds()) snapshot[channelId] = store.channels.get(channelId) ?? [];
  return snapshot;
}

function publish() {
  if (store.listeners.size === 0) return;
  const snapshot = presenceSnapshot();
  for (const notify of store.listeners) {
    try {
      notify(snapshot);
    } catch (error) {
      console.error('[rtc/presence] listener falhou', error);
    }
  }
}

/** Escreve o canal e avisa os assinantes só quando algo de fato mudou. */
function setChannel(channelId: string, participants: PresenceParticipant[]): boolean {
  const next = sortParticipants(participants);
  const current = store.channels.get(channelId);
  if (current && same(current, next)) return false;

  store.channels.set(channelId, next);
  publish();
  return true;
}

/**
 * O ponto: listParticipants numa sala que não existe custa ~1s no LiveKit Cloud
 * (não é retry do SDK — failover:false não muda), e sala inexistente é
 * exatamente o caso "canal vazio", o mais comum. listRooms(ids) responde em
 * ~140ms dizendo quais salas existem e com quantas pessoas, então só as com
 * gente pagam um listParticipants — que aí custa ~11ms, porque a sala existe.
 */
async function refreshFromLiveKit(): Promise<void> {
  const channels = await getVoiceChannels();
  const ids = channels.map((channel) => channel.id);
  store.channelIds = ids;
  const rooms = await livekitApi().room.listRooms(ids);
  const populated = new Map(rooms.map((room) => [room.name, room.numParticipants]));

  await Promise.all(
    ids.map(async (channelId) => {
      if (!populated.get(channelId)) {
        setChannel(channelId, []);
        return;
      }

      try {
        // listParticipants devolve o ParticipantInfo completo, então aqui não
        // há o que preservar do estado anterior — é a leitura autoritativa.
        const participants = await livekitApi().room.listParticipants(channelId);
        setChannel(channelId, participants.map((participant) => toPresenceParticipant(participant)));
      } catch (error) {
        // Sala esvaziou entre o listRooms e agora — sem gente, não é erro.
        if (error instanceof ServerError && error.status === 404) {
          setChannel(channelId, []);
          return;
        }
        throw error;
      }
    }),
  );

  store.refreshedAt = Date.now();
  store.hydrated = true;
}

function refresh(): Promise<void> {
  if (store.inFlight) return store.inFlight;

  store.inFlight = refreshFromLiveKit()
    .catch((error) => {
      console.error('[rtc/presence] falha ao ler presença do LiveKit', error);
      // Mantém o último snapshot conhecido em vez de esvaziar todos os canais
      // por uma instabilidade de rede.
    })
    .finally(() => {
      store.inFlight = null;
    });

  return store.inFlight;
}

function isBusy(): boolean {
  for (const participants of store.channels.values()) if (participants.length > 0) return true;
  return false;
}

/**
 * Resync roda por timer e só enquanto alguém está de fato olhando (assinante de
 * SSE). Sem ninguém olhando não há o que atualizar, e é isso que impede o
 * processo de ficar consultando o LiveKit 24h por dia à toa.
 */
function scheduleResync() {
  if (store.resyncTimer) {
    clearTimeout(store.resyncTimer);
    store.resyncTimer = null;
  }
  if (store.listeners.size === 0) return;

  store.resyncTimer = setTimeout(
    () => {
      store.resyncTimer = null;
      void refresh().finally(scheduleResync);
    },
    isBusy() ? RESYNC_BUSY_MS : RESYNC_IDLE_MS,
  );
}

/**
 * Leitura sob demanda (GET em /api/rtc/presence/[id] e /api/presence/users).
 * Com webhook vivo o store já está correto, então a leitura não espera nada; um
 * resync só é disparado em background. Sem webhook, cai na janela de 3s e
 * espera — o comportamento antigo, agora sem o listParticipants caro.
 */
function ensureFresh(): Promise<void> {
  if (!store.hydrated) return refresh();

  const staleAfter = webhooksAlive() ? RESYNC_IDLE_MS : POLL_TTL_MS;
  if (Date.now() - store.refreshedAt < staleAfter) return Promise.resolve();

  if (webhooksAlive()) {
    void refresh();
    return Promise.resolve();
  }
  return refresh();
}

export async function loadPresence(channelId: string): Promise<PresenceParticipant[]> {
  await ensureFresh();
  return store.channels.get(channelId) ?? [];
}

export async function loadAllPresence(): Promise<PresenceSnapshot> {
  await ensureFresh();
  return presenceSnapshot();
}

/**
 * Saída explícita via /api/rtc/leave: o servidor acabou de chamar
 * removeParticipant, então dá pra tirar a pessoa do store na hora em vez de
 * esperar o webhook `participant_left` dar a volta. É o que faz o fantasma
 * sumir imediatamente pra quem está olhando de fora.
 */
export function dropParticipant(channelId: string, identity: string): void {
  const current = store.channels.get(channelId);
  if (!current) return;

  const next = current.filter((participant) => participant.identity !== identity);
  if (next.length !== current.length) setChannel(channelId, next);
}

/** Alimenta o store a partir de /api/rtc/webhook — ver applyPresenceWebhook lá. */
export async function applyPresenceWebhook(event: WebhookEvent): Promise<void> {
  const channelId = event.room?.name;
  if (!channelId || !(await getVoiceChannel(channelId))) return;

  store.lastWebhookAt = Date.now();

  switch (event.event) {
    // room_started não é tratado de propósito: pra presença, sala vazia e sala
    // inexistente são a mesma coisa, então o evento não informa nada — e
    // limpar o canal aqui perderia um participant_joined que corresse na
    // frente dele (webhook não garante ordem de entrega).
    case 'room_finished':
      setChannel(channelId, []);
      return;

    case 'participant_left':
    case 'participant_connection_aborted': {
      if (event.participant) dropParticipant(channelId, event.participant.identity);
      return;
    }

    case 'participant_joined': {
      if (!event.participant) return;
      const current = store.channels.get(channelId) ?? [];
      const previous = current.find((p) => p.identity === event.participant!.identity);
      const participant = toPresenceParticipant(event.participant, previous);
      setChannel(channelId, [...current.filter((p) => p.identity !== participant.identity), participant]);
      return;
    }

    case 'track_published':
    case 'track_unpublished': {
      if (!event.participant || !event.track) return;
      applyTrackChange(channelId, event.participant.identity, event.track, event.event === 'track_published');
      return;
    }
  }
}

/** Assina o snapshot de todos os canais (usado pelo SSE em /api/rtc/presence/events). */
export function subscribeToPresence(notify: (snapshot: PresenceSnapshot) => void): () => void {
  store.listeners.add(notify);
  // Primeiro assinante liga o resync; se o store nunca foi populado (processo
  // recém-subido), hidrata agora pra o cliente não receber um snapshot vazio.
  if (!store.hydrated) void refresh().then(() => notify(presenceSnapshot()));
  scheduleResync();

  return () => {
    store.listeners.delete(notify);
    if (store.listeners.size > 0) return;
    if (store.resyncTimer) {
      clearTimeout(store.resyncTimer);
      store.resyncTimer = null;
    }
  };
}
