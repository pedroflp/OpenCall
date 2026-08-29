import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateRolesCache } from '@/lib/access';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

// ADMIN e CHANNELS_ACCESS podem chegar aqui (hasChannelsAdminAccess já cobre
// os dois) — a distinção fina de quem pode desativar de quem é feita abaixo,
// não no gate.
export async function POST(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.isChannelsAdmin) return err(403, 'FORBIDDEN');

  try {
    // Quem administra o acesso aos canais de alguém precisa ter esse acesso
    // também — concede CANAL_ACCESS junto, numa escrita atômica só.
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: params.userId }, select: { roles: true } });
      const roles = new Set(user.roles);
      roles.add(UserRole.CHANNELS_ACCESS);
      roles.add(UserRole.CANAL_ACCESS);
      await tx.user.update({ where: { id: params.userId }, data: { roles: Array.from(roles) } });
    });
    invalidateRolesCache(params.userId);
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'GRANT_FAILED');
  }
}

// Regra: só quem já é ADMIN pode desativar CHANNELS_ACCESS de outro ADMIN — um
// CHANNELS_ACCESS comum só consegue conceder pra um admin (formando o combo
// "superadmin"), nunca revogar. Auto-remoção também é bloqueada, mesmo motivo
// do admin-role original: evita ficar sem ninguém pra reverter.
export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.isChannelsAdmin) return err(403, 'FORBIDDEN');
  if (session.user.id === params.userId) return err(400, 'CANNOT_SELF_DEMOTE');

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { roles: true } });
  const targetIsAdmin = Boolean(target?.roles.includes(UserRole.ADMIN));
  if (targetIsAdmin && !session.user.isAdmin) return err(403, 'CANNOT_MODIFY_ADMIN');

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: params.userId }, select: { roles: true } });
      const roles = user.roles.filter((role) => role !== UserRole.CHANNELS_ACCESS);
      await tx.user.update({ where: { id: params.userId }, data: { roles } });
    });
    invalidateRolesCache(params.userId);
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'REVOKE_FAILED');
  }
}

export const dynamic = 'force-dynamic';
