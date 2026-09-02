import { fetchApi } from '@/services/api/fetchApi';

export async function createInvite() {
  const response = await fetchApi('admin/invites', { method: 'POST' });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

/** Revogação (soft — ver revokedAt no schema), não delete: mantém o histórico de resgates do código. */
export async function revokeInvite(inviteId: string) {
  const response = await fetchApi(`admin/invites/${inviteId}`, { method: 'DELETE' });
  return { ok: response.ok };
}
