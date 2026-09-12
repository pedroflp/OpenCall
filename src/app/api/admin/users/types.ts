import type { UserRoles } from '@/app/api/user/types';

export type AdminUserDTO = {
  id: string;
  username: string;
  avatar: string;
  groups: string[];
  roles: UserRoles[];
  bannedAt: string | null;
}
