import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import type { AdminInviteDTO } from './types';
import { listAdminInvites } from './queries';

// Chamada direta (sem fetchApi) — roda só dentro de Server Components, mesmo
// motivo de getAdminChannels.
export async function getAdminInvites(): Promise<AdminInviteDTO[]> {
  if (!(await isCurrentUserChannelsAdmin())) return [];
  return listAdminInvites();
}
