import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/services/prisma';
import { hasCanalAccess, hasChannelsAdminAccess, mapPrismaRoles } from '@/lib/access';
import { UserRoles } from '@/app/api/user/types';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { consumePairing } from '@/lib/auth/qrPairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QR_CONFIRM_RATE_LIMIT = { windowMs: 60_000, max: 20 };
// Mesmo default do NextAuth pra session.maxAge (30 dias) — authOptions.ts não
// sobrescreve, então a sessão emitida aqui tem que expirar igual à normal.
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionCookieName(): string {
  const secure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/**
 * Endpoint público (sem sessão) chamado pelo celular ao abrir o link do QR.
 * A autoridade aqui não vem de cookie nenhum — vem só de possuir o `id` do
 * pareamento, aleatório de 192 bits e de uso único (ver consumePairing em
 * qrPairing.ts). Emite uma sessão NOVA e independente pro celular, nos
 * mesmos moldes do callback jwt de authOptions.ts — nunca copia a sessão do
 * PC, então cada dispositivo fica com seu próprio JWT (accessToken do
 * Discord fica de fora: não existe handshake OAuth novo aqui, e nada no app
 * hoje lê session.user.accessToken).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = checkRateLimit(`qr-pairing-confirm:${ip}`, QR_CONFIRM_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const consumed = consumePairing(params.id);
  if (!consumed) return NextResponse.json({ error: 'INVALID_OR_EXPIRED' }, { status: 410 });

  const dbUser = await prisma.user.findUnique({ where: { id: consumed.userId } });
  if (!dbUser) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });

  const roles = mapPrismaRoles(dbUser.roles);

  const jwt = await encode({
    token: {
      id: dbUser.id,
      username: dbUser.username,
      avatar: dbUser.avatar,
      email: dbUser.email,
      canalAccess: hasCanalAccess(roles),
      isAdmin: roles.includes(UserRoles.ADMIN),
      isChannelsAdmin: hasChannelsAdminAccess(roles),
      rolesFetchedAt: Date.now(),
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
