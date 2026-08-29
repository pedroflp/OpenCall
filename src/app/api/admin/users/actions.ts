import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import type { AdminUserDTO } from './types';
import { listAdminUsers } from './queries';

// Chamada direta (sem fetchApi) — mesmo motivo do getAdminGroups: isso só roda
// em Server Components, ir via HTTP pra própria instância era puro overhead.
export async function getAdminUsers(): Promise<AdminUserDTO[]> {
  if (!(await isCurrentUserChannelsAdmin())) return [];
  return listAdminUsers();
}
