import type { Prisma } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { DEFAULT_STREAM_SETTINGS, parseStreamSettings, type StreamSettings } from './streamQuality';

/** StreamSettings é um shape fechado; a coluna Json do Prisma pede index signature. */
function asJson(settings: StreamSettings): Prisma.InputJsonValue {
  return settings as unknown as Prisma.InputJsonValue;
}

const DISABLED_ENV_VALUES = new Set(['false', '0']);
const CACHE_TTL_MS = 10_000;

/** Config de canais é uma linha só (ver model ChannelsConfig) — nunca há mais de uma. */
const SINGLETON_ID = 1;

export interface ChannelsConfig {
  enabled: boolean;
  streamSettings: StreamSettings;
}

const DEFAULT_CONFIG: ChannelsConfig = {
  enabled: true,
  streamSettings: DEFAULT_STREAM_SETTINGS,
};

interface ConfigCache {
  config: ChannelsConfig;
  fetchedAt: number;
  inFlight: Promise<ChannelsConfig> | null;
}

const globalForConfig = globalThis as unknown as { __rtcConfigCache?: ConfigCache };
const cache = (globalForConfig.__rtcConfigCache ??= {
  config: DEFAULT_CONFIG,
  fetchedAt: 0,
  inFlight: null,
});

function envEnabled(): boolean {
  return !DISABLED_ENV_VALUES.has((process.env.NEXT_PUBLIC_RTC_ENABLED ?? '').toLowerCase());
}

async function fetchConfig(): Promise<ChannelsConfig> {
  const row = await prisma.channelsConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) return DEFAULT_CONFIG;

  return {
    enabled: row.enabled,
    streamSettings: parseStreamSettings(row.streamSettings) ?? DEFAULT_STREAM_SETTINGS,
  };
}

/**
 * NEXT_PUBLIC_RTC_ENABLED=false é trava de emergência do deploy inteiro e
 * ganha do toggle do admin. Aplicada na saída (não no que vai pro cache) pra
 * uma escrita do admin nunca conseguir gravar um `enabled: true` que escape
 * dela.
 */
function withEnvOverride(config: ChannelsConfig): ChannelsConfig {
  if (envEnabled()) return config;
  return { ...config, enabled: false };
}

/**
 * Kill switch e qualidade de transmissão vivem na MESMA linha e são lidos pelo
 * mesmo cache de propósito: os dois entram no caminho do join, e antes (quando
 * moravam no doc `app-config/channels` do Firestore) cada um tinha seu próprio
 * cache — o join pagava duas leituras do mesmo documento remoto.
 *
 * Cacheado por 10s: em deploy com múltiplas instâncias, cada uma converge em
 * até 10s. Quem já está conectado não espera isso pra mudança de qualidade,
 * recebe pelo metadata da sala (ver /api/rtc/stream-config).
 */
export function getChannelsConfig(): Promise<ChannelsConfig> {
  if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return Promise.resolve(withEnvOverride(cache.config));
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = fetchConfig()
    .then((config) => {
      cache.config = config;
      cache.fetchedAt = Date.now();
      cache.inFlight = null;
      return withEnvOverride(config);
    })
    .catch(() => {
      cache.inFlight = null;
      // Banco instável não deve derrubar a voz nem jogar a qualidade pro
      // default no meio de uma live — mantém o último estado conhecido.
      return withEnvOverride(cache.config);
    });

  return cache.inFlight;
}

function primeCache(config: ChannelsConfig) {
  cache.config = config;
  cache.fetchedAt = Date.now();
  cache.inFlight = null;
}

/** Toggle do admin (dock) já combinado com a trava de ambiente — ver withEnvOverride. */
export async function isRtcEnabled(): Promise<boolean> {
  return (await getChannelsConfig()).enabled;
}

export async function getStreamSettings(): Promise<StreamSettings> {
  return (await getChannelsConfig()).streamSettings;
}

export async function setRtcEnabled(enabled: boolean): Promise<void> {
  const row = await prisma.channelsConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, enabled, streamSettings: asJson(DEFAULT_STREAM_SETTINGS) },
    update: { enabled },
  });

  primeCache({
    enabled: row.enabled,
    streamSettings: parseStreamSettings(row.streamSettings) ?? DEFAULT_STREAM_SETTINGS,
  });
}

export async function setStreamSettings(streamSettings: StreamSettings): Promise<void> {
  const row = await prisma.channelsConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, streamSettings: asJson(streamSettings) },
    update: { streamSettings: asJson(streamSettings) },
  });

  primeCache({ enabled: row.enabled, streamSettings });
}
