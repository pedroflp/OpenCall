import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateRolesCache } from '@/lib/access';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

// ADMIN já implica canalAccess (ver hasCanalAccess em @/lib/access) — só o
// role CANAL_ACCESS é manipulado aqui, revogar dele um admin não mudaria o
// acesso efetivo, então o toggle nem chega a chamar essa rota pra esses casos.
export async function POST(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: params.userId }, select: { roles: true } });
      if (user.roles.includes(UserRole.CANAL_ACCESS)) return;
      await tx.user.update({ where: { id: params.userId }, data: { roles: { push: UserRole.CANAL_ACCESS } } });
    });
    invalidateRolesCache(params.userId);
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'GRANT_FAILED');
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: params.userId }, select: { roles: true } });
      const roles = user.roles.filter((role) => role !== UserRole.CANAL_ACCESS);
      await tx.user.update({ where: { id: params.userId }, data: { roles } });
    });
    invalidateRolesCache(params.userId);
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'REVOKE_FAILED');
  }
}

export const dynamic = 'force-dynamic';
