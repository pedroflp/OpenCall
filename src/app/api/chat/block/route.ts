import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { publishToChannel } from '@/lib/chat/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isChannelsAdmin) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const targetUserId = (body as { targetUserId?: unknown } | null)?.targetUserId;
  const blocked = (body as { blocked?: unknown } | null)?.blocked;
  if (typeof targetUserId !== 'string' || typeof blocked !== 'boolean') return err(400, 'INVALID_BODY');

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { roles: true } });
  if (!target) return err(404, 'USER_NOT_FOUND');

  // Mesma régua do kick (src/app/api/rtc/kick/route.ts): um channels_admin sem
  // ser ADMIN completo não pode bloquear um ADMIN.
  if (!session.user.isAdmin && target.roles.includes(UserRole.ADMIN)) return err(403, 'CANNOT_BLOCK_ADMIN');

  await prisma.user.update({ where: { id: targetUserId }, data: { chatBlocked: blocked } });
  publishToChannel({ type: 'blocked', userId: targetUserId, blocked });

  return NextResponse.json({ ok: true, blocked });
}
