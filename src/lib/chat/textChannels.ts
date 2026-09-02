import { ChannelType } from '@prisma/client';
import { getChannel, getChannelsByType, type Channel } from '@/lib/rtc/channels';

/**
 * Canal de texto — mesma tabela/cache de canal de voz (ver ADR-0001), filtrada
 * por type: TEXT. `global` é o canal seedado na migração, mesmo id que a
 * constante TEXT_CHANNEL_ID usava antes do canal virar dinâmico.
 *
 * Arquivo separado de lib/chat/channel.ts de propósito: aquele tem as
 * constantes puras importadas por componentes client, e este puxa Prisma (via
 * lib/rtc/channels) — misturar os dois quebraria o bundle client.
 */
export async function getTextChannel(id: string): Promise<Channel | undefined> {
  const channel = await getChannel(id);
  return channel?.type === ChannelType.TEXT ? channel : undefined;
}

export async function getTextChannels(): Promise<Channel[]> {
  return getChannelsByType(ChannelType.TEXT);
}

export async function getDefaultTextChannelId(): Promise<string | null> {
  const [first] = await getTextChannels();
  return first?.id ?? null;
}
