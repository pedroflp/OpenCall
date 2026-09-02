import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { createPairing } from '@/lib/auth/devicePairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QR_CREATE_RATE_LIMIT = { windowMs: 10 * 60_000, max: 10 };

/**
 * Dispositivo já logado pede um pareamento — nunca a sessão em si, ver
 * src/lib/auth/devicePairing.ts. A resposta traz os dois transportes do mesmo
 * pareamento: o `id` de 192 bits que vai dentro do QR e o `code` de 6
 * caracteres pra quem vai digitar do outro lado.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { allowed, retryAfterMs } = checkRateLimit(`qr-pairing-create:${user.id}`, QR_CREATE_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const pairing = createPairing(user.id);
  return NextResponse.json(pairing);
}
