import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { consumePairingCode } from '@/lib/auth/devicePairing';
import { issueDeviceSession } from '@/lib/auth/deviceSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bem mais apertado que o confirm por `id` (20/min): lá o segredo tem 192 bits
// e ninguém adivinha, aqui são 6 caracteres e o rate limit é justamente o que
// transforma "espaço de 2^30" em "inviável" — ver a nota em consumePairingCode.
// 10 tentativas por 5 minutos ainda cabe folgado em quem errou de digitar.
const CODE_RATE_LIMIT = { windowMs: 5 * 60_000, max: 10 };

/**
 * Endpoint público (sem sessão) chamado pelo dispositivo NOVO com o código de 6
 * caracteres exibido no dispositivo já logado. Uso único: o código sai do
 * índice na primeira tentativa certa.
 *
 * O código nunca entra em log, resposta de erro ou telemetria — quem vê a
 * saída não pode reconstruir o que foi tentado. Por isso `INVALID_OR_EXPIRED`
 * é uma resposta só pra "não existe", "expirou" e "já foi usado": distinguir
 * os três diria a um atacante que ele acertou um código vivo tarde demais.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed, retryAfterMs } = checkRateLimit(`qr-pairing-code:${ip}`, CODE_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== 'string') return NextResponse.json({ error: 'INVALID_OR_EXPIRED' }, { status: 410 });

  const consumed = consumePairingCode(body.code);
  if (!consumed) return NextResponse.json({ error: 'INVALID_OR_EXPIRED' }, { status: 410 });

  return issueDeviceSession(consumed.userId);
}
