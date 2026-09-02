import { prisma } from '@/services/prisma';
import type { AdminInviteDTO } from './types';

/** Mais recente primeiro — é o que interessa pra quem acabou de criar um código. */
export async function listAdminInvites(): Promise<AdminInviteDTO[]> {
  const rows = await prisma.inviteCode.findMany({ orderBy: { createdAt: 'desc' } });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    redeemedCount: row.redeemedCount,
  }));
}
