import { prisma } from '@/services/prisma';

/** Grava quando o usuário ficou ausente/offline (ver resolveAwaySince em platformPresence.ts) — sobrevive a restart/deploy, ao contrário do resto do módulo de presença. */
export async function persistAwaySince(userId: string, awaySinceIso: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date(awaySinceIso) } });
}

/** Voltou a ficar online: remove a marca, pra não sobrar um "há X minutos" fantasma numa próxima ausência. */
export async function clearAwaySince(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: null } });
}
