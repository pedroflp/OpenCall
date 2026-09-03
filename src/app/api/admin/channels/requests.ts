import { fetchApi } from '@/services/api/fetchApi';
import type { AdminChannelDTO } from './types';
import type { ChannelType } from '@prisma/client';

/** Lista de canais pro host CLIENT do admin (o modal de Configurações) — a página `/admin` usa `getAdminChannels` direto no servidor. */
export async function fetchAdminChannels(): Promise<AdminChannelDTO[] | null> {
  const response = await fetchApi('admin/channels');
  if (!response.ok) return null;
  return (await response.json()).channels;
}


/** `maxParticipants: null` é canal de voz sem limite; ausente, pra texto, é o campo não se aplicar (ADR-0001). */
export type ChannelCreateInput = { type: ChannelType; name: string; maxParticipants?: number | null };
/** `null` remove o limite; ausente não mexe no valor gravado. */
export type ChannelUpdateInput = { name?: string; maxParticipants?: number | null };

export async function createChannel(input: ChannelCreateInput) {
  const response = await fetchApi('admin/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export async function updateChannel(channelId: string, input: ChannelUpdateInput) {
  const response = await fetchApi(`admin/channels/${channelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

/** Hard-delete de verdade (ver ADR-0003 revisada) — sem volta, chamado só depois do double confirm na UI. */
export async function deleteChannel(channelId: string) {
  const response = await fetchApi(`admin/channels/${channelId}`, { method: 'DELETE' });
  return { ok: response.ok };
}
