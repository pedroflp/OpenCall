import { prisma } from '@/services/prisma';
import { mapPrismaRoles } from '@/lib/access';
import type { AdminUserDTO } from './types';

export async function listAdminUsers(): Promise<AdminUserDTO[]> {
  const dbUsers = await prisma.user.findMany({
    select: { id: true, username: true, avatar: true, groups: true, roles: true, bannedAt: true },
    orderBy: { username: 'asc' },
  });

  return dbUsers.map((user) => ({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    groups: user.groups,
    roles: mapPrismaRoles(user.roles),
    bannedAt: user.bannedAt?.toISOString() ?? null,
  }));
}
