import { fetchApi } from '@/services/api/fetchApi';
import type { ChannelType } from '@prisma/client';

export type ChannelCreateInput = { type: ChannelType; name: string; maxParticipants?: number };
export type ChannelUpdateInput = { name?: string; maxParticipants?: number };

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
