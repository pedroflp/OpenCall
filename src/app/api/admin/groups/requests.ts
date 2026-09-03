import { fetchApi } from '@/services/api/fetchApi';
import type { GroupDTO } from '@/app/api/groups/types';

/** Mesmo motivo do fetchAdminChannels: o modal de Configurações não é Server Component. */
export async function fetchAdminGroups(): Promise<GroupDTO[] | null> {
  const response = await fetchApi('admin/groups');
  if (!response.ok) return null;
  return (await response.json()).groups;
}


export type GroupInput = { title: string; textColor: string; sortIndex: number };

export async function createGroup(input: GroupInput) {
  const response = await fetchApi('admin/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export async function updateGroup(groupId: string, input: Partial<GroupInput>) {
  const response = await fetchApi(`admin/groups/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export async function deleteGroup(groupId: string) {
  const response = await fetchApi(`admin/groups/${groupId}`, { method: 'DELETE' });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export async function addGroupMembers(groupId: string, userIds: string[]) {
  const response = await fetchApi(`admin/groups/${groupId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export async function removeGroupMember(groupId: string, userId: string) {
  const response = await fetchApi(`admin/groups/${groupId}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}
