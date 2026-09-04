import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { prisma } from '@/services/prisma';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { invalidateRolesCache } from '@/lib/access';
import { normalizeInviteCode } from '@/lib/invite/inviteCode';
import { checkRateLimit } from '@/lib/rtc/rateLimit';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

const REDEEM_RATE_LIMIT = { windowMs: 5 * 60_000, max: 10 };

/**
 * Concede CANAL_ACCESS a quem já tem conta (Discord) mas ainda não tem acesso
 * aos canais — usado pelo NoAccessPopover (código colado) e pelo auto-resgate
 * via `?invite=` (ver signIn callback em authOptions.ts). Multi-uso: o mesmo
 * código serve pra vários usuários até um admin revogar (invite.revokedAt).
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`invite-redeem:${user.id}`, REDEEM_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? normalizeInviteCode(body.code) : '';
  if (!code) return err(400, 'INVALID_CODE');

  try {
    const granted = await prisma.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findUnique({ where: { code } });
      if (!invite || invite.revokedAt) return false;

      const dbUser = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { roles: true } });
      if (!dbUser.roles.includes(UserRole.CANAL_ACCESS)) {
        await tx.user.update({ where: { id: user.id }, data: { roles: { push: UserRole.CANAL_ACCESS } } });
      }
      await tx.inviteCode.update({ where: { id: invite.id }, data: { redeemedCount: { increment: 1 } } });
      return true;
    });

    if (!granted) return err(404, 'INVALID_CODE');

    invalidateRolesCache(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return err(500, 'REDEEM_FAILED');
  }
}
