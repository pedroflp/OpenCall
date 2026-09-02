import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { GIPHY_SEARCH_RATE_LIMIT } from '@/lib/chat/channel';
import { fetchGifs } from '@/lib/chat/giphy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 80;

/** Proxy da busca do Giphy: autentica, limita e devolve só os campos que o popover usa. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { allowed, retryAfterMs } = checkRateLimit(`chat-giphy:${user.id}`, GIPHY_SEARCH_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  try {
    return NextResponse.json({ gifs: await fetchGifs(query, offset) });
  } catch (error) {
    console.error('[chat/giphy] busca falhou', error);
    return NextResponse.json({ error: 'GIPHY_UNAVAILABLE' }, { status: 502 });
  }
}
