import { fetchApi } from '@/services/api/fetchApi';
import type { AdminInviteDTO } from './types';

export async function fetchAdminInvites(): Promise<AdminInviteDTO[] | null> {
  const response = await fetchApi('admin/invites');
  if (!response.ok) return null;
  return (await response.json()).invites;
}


export async function createInvite() {
  const response = await fetchApi('admin/invites', { method: 'POST' });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

/** Revogação (soft — ver revokedAt no schema), não delete: mantém o histórico de resgates do código. */
export async function revokeInvite(inviteId: string) {
  const response = await fetchApi(`admin/invites/${inviteId}`, { method: 'DELETE' });
  return { ok: response.ok };
}
