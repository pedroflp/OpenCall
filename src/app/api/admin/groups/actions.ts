import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import type { GroupDTO } from '@/app/api/groups/types';
import { listAdminGroups } from './queries';

// Chamada direta (sem fetchApi) — isso roda só dentro de Server Components,
// então ir via HTTP pra própria instância era um round-trip inteiro (+ checagem
// de auth duplicada dentro da rota) só pra ler o que já dava pra ler direto.
export async function getAdminGroups(): Promise<GroupDTO[]> {
  if (!(await isCurrentUserAdmin())) return [];
  return listAdminGroups();
}
