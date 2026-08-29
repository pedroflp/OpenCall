import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { createPairing } from '@/lib/auth/qrPairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QR_CREATE_RATE_LIMIT = { windowMs: 10 * 60_000, max: 10 };

/** PC (já logado) pede um código de pareamento pra gerar o QR — nunca a sessão em si, ver src/lib/auth/qrPairing.ts. */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { allowed, retryAfterMs } = checkRateLimit(`qr-pairing-create:${user.id}`, QR_CREATE_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const pairing = createPairing(user.id);
  return NextResponse.json(pairing);
}
