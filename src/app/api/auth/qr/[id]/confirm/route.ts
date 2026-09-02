import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { consumePairing } from '@/lib/auth/devicePairing';
import { issueDeviceSession } from '@/lib/auth/deviceSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QR_CONFIRM_RATE_LIMIT = { windowMs: 60_000, max: 20 };

/**
 * Endpoint público (sem sessão) chamado pelo celular ao abrir o link do QR.
 * A autoridade aqui não vem de cookie nenhum — vem só de possuir o `id` do
 * pareamento, aleatório de 192 bits e de uso único (ver consumePairing em
 * devicePairing.ts). A sessão que sai daqui é a mesma que sai do código
 * digitado: issueDeviceSession é uma só (ver deviceSession.ts).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = checkRateLimit(`qr-pairing-confirm:${ip}`, QR_CONFIRM_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const consumed = consumePairing(params.id);
  if (!consumed) return NextResponse.json({ error: 'INVALID_OR_EXPIRED' }, { status: 410 });

  return issueDeviceSession(consumed.userId);
}
