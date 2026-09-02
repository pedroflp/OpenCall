import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/services/prisma';
import { hasCanalAccess, hasChannelsAdminAccess, mapPrismaRoles } from '@/lib/access';
import { UserRoles } from '@/app/api/user/types';

// Mesmo default do NextAuth pra session.maxAge (30 dias) — authOptions.ts não
// sobrescreve, então a sessão emitida aqui tem que expirar igual à normal.
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionCookieName(): string {
  const secure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/**
 * O fim de todo pareamento: emite uma sessão NOVA e independente pro
 * dispositivo que acabou de provar o pareamento, nos mesmos moldes do callback
 * `jwt` de authOptions.ts — nunca copia a sessão da origem, então cada
 * dispositivo fica com seu próprio JWT (o `accessToken` do Discord fica de
 * fora: não existe handshake OAuth novo aqui, e nada no app hoje lê
 * `session.user.accessToken`).
 *
 * Vive aqui, e não na rota, porque agora são dois transportes chegando ao mesmo
 * lugar (o `id` do QR e o código digitado). Duas cópias desta função é
 * exatamente a duplicata que passa a divergir na primeira vez que alguém mexer
 * numa claim — e a claim que divergisse seria de autorização.
 */
export async function issueDeviceSession(userId: string): Promise<NextResponse> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
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
