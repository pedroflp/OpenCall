import { prisma } from '@/services/prisma';
import type { GroupDTO } from '@/app/api/groups/types';

export async function listAdminGroups(): Promise<GroupDTO[]> {
  return prisma.group.findMany({ orderBy: { sortIndex: 'asc' } });
}
