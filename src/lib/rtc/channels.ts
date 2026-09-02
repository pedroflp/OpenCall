import { ChannelType } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { widthForHeight, type DegradationPreference, type StreamSettings } from './streamQuality';

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  maxParticipants: number | null;
  sortIndex: number;
}

/**
 * Canais dinâmicos (ver RFC "Canais dinâmicos") viraram query no Postgres —
 * cacheada em memória, TTL curto, mesmo padrão de channelsConfig.ts. A ADR-0004
 * pedia Upstash Redis, mas o projeto não usa Redis em lugar nenhum (rodando em
 * processo único no Railway, ver rtc-infra-constraints em rateLimit.ts) —
 * seguimos o padrão real do resto do código em vez da ADR nesse ponto; uma
 * réplica extra só convergiria em até CACHE_TTL_MS a mais, igual já acontece
 * hoje com o kill switch.
 */
const CACHE_TTL_MS = 5_000;

interface ChannelsCache {
  channels: Channel[] | null;
  fetchedAt: number;
  inFlight: Promise<Channel[]> | null;
}

const globalForChannels = globalThis as unknown as { __rtcChannelsCache?: ChannelsCache };
const cache = (globalForChannels.__rtcChannelsCache ??= { channels: null, fetchedAt: 0, inFlight: null });

function toChannel(row: {
  id: string;
  type: ChannelType;
  name: string;
  maxParticipants: number | null;
  sortIndex: number;
}): Channel {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    maxParticipants: row.maxParticipants,
    sortIndex: row.sortIndex,
  };
}

async function fetchActiveChannels(): Promise<Channel[]> {
  const rows = await prisma.channel.findMany({
    orderBy: { sortIndex: 'asc' },
    select: { id: true, type: true, name: true, maxParticipants: true, sortIndex: true },
  });
  return rows.map(toChannel);
}

async function getAllChannels(): Promise<Channel[]> {
  if (cache.channels && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.channels;
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = fetchActiveChannels()
    .then((channels) => {
      cache.channels = channels;
      cache.fetchedAt = Date.now();
      cache.inFlight = null;
      return channels;
    })
    .catch((error) => {
      cache.inFlight = null;
      // Banco instável não deve derrubar join/presença — mantém a última
      // lista conhecida (mesmo comportamento de channelsConfig.ts).
      if (cache.channels) return cache.channels;
      throw error;
    });

  return cache.inFlight;
}

/** Chamada por toda escrita em /api/admin/channels (ver ADR-0004) — sem isso, criar/editar/arquivar um canal só refletiria depois do TTL expirar. */
export function invalidateChannelsCache(): void {
  cache.channels = null;
  cache.fetchedAt = 0;
}

export async function getChannel(id: string): Promise<Channel | undefined> {
  const channels = await getAllChannels();
  return channels.find((channel) => channel.id === id);
}

/** Usado pelas rotas de RTC — recusa um id de canal de texto do mesmo jeito que recusaria um id inexistente. */
export async function getVoiceChannel(id: string): Promise<Channel | undefined> {
  const channel = await getChannel(id);
  return channel?.type === ChannelType.VOICE ? channel : undefined;
}

export async function getChannelsByType(type: ChannelType): Promise<Channel[]> {
  const channels = await getAllChannels();
  return channels.filter((channel) => channel.type === type);
}

export async function getVoiceChannels(): Promise<Channel[]> {
  return getChannelsByType(ChannelType.VOICE);
}

export async function getDefaultChannelId(): Promise<string | null> {
  const [first] = await getVoiceChannels();
  return first?.id ?? null;
}

// Resolução de origem, framerate e teto de bitrate agora vêm do painel do admin
// (ver channelsConfig) — resolução e bitrate precisam andar juntos, o que é
// justamente o que os presets garantem. Codec e DTX seguem fixos: não são
// escolha de operação, e trocar codec em runtime tem efeito colateral na sala
// inteira (backupCodec derruba todo mundo pra VP8).
const SCREEN_SHARE_CODEC = 'vp9';
const DTX_ENABLED = true;

export interface RtcConfig {
  screenShareMaxBitrate: number;
  screenShareMaxFramerate: number;
  screenShareWidth: number;
  screenShareHeight: number;
  screenShareCodec: typeof SCREEN_SHARE_CODEC;
  screenShareDegradationPreference: DegradationPreference;
  dtx: boolean;
}

export function buildRtcConfig(settings: StreamSettings): RtcConfig {
  return {
    screenShareMaxBitrate: settings.maxBitrateKbps * 1000,
    screenShareMaxFramerate: settings.frameRate,
    screenShareWidth: widthForHeight(settings.height),
    screenShareHeight: settings.height,
    screenShareCodec: SCREEN_SHARE_CODEC,
    screenShareDegradationPreference: settings.degradationPreference,
    dtx: DTX_ENABLED,
  };
}
