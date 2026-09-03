import { fetchApi } from '@/services/api/fetchApi';
import type { AdminUserDTO } from './types';

/** Lista de usuários pro host CLIENT do admin (o modal de Configurações) — a página `/admin` usa `getAdminUsers` direto no servidor. */
export async function fetchAdminUsers(): Promise<AdminUserDTO[] | null> {
  const response = await fetchApi('admin/users');
  if (!response.ok) return null;
  return (await response.json()).users;
}
