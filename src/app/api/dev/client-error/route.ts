import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rtc/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_ERROR_RATE_LIMIT = { windowMs: 60_000, max: 20 };

/**
 * Sem Sentry no projeto: essa rota é o destino de error.tsx/global-error.tsx
 * pra pelo menos cair no log do Railway com stack trace + user-agent, em vez
 * de só a tela branca genérica do Next sem nenhum rastro.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = checkRateLimit(`client-error:${ip}`, CLIENT_ERROR_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false }, { status: 400 });

  const { message, stack, digest, url, userAgent, boundary } = body as Record<string, unknown>;

  console.error(
    '[client-error]',
    JSON.stringify({
      boundary,
      message,
      digest,
      url,
      userAgent,
      stack,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true });
}
