import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import type { AdminChannelDTO } from './types';
import { listAdminChannels } from './queries';

// Chamada direta (sem fetchApi) — roda só dentro de Server Components, mesmo
// motivo de getAdminGroups.
export async function getAdminChannels(): Promise<AdminChannelDTO[]> {
  if (!(await isCurrentUserChannelsAdmin())) return [];
  return listAdminChannels();
}
