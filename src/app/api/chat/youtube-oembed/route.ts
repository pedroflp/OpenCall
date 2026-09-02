import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { YOUTUBE_OEMBED_RATE_LIMIT } from '@/lib/chat/channel';
import { youtubeVideoId, youtubeWatchUrl } from '@/lib/chat/youtubeUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUEST_TIMEOUT_MS = 8_000;

interface OembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Proxy pro oEmbed público do YouTube: sem chave, mas passar pela nossa rota
 * evita expor de qual vídeo cada usuário gosta pro YouTube direto do browser
 * dele, e dá pra limitar/validar a URL antes (só id de vídeo real, nada de
 * proxy aberto pra qualquer host).
 */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { allowed, retryAfterMs } = checkRateLimit(`chat-youtube-oembed:${user.id}`, YOUTUBE_OEMBED_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterMs }, { status: 429 });

  const url = new URL(req.url);
  const id = youtubeVideoId(url.searchParams.get('url') ?? '');
  if (!id) return NextResponse.json({ error: 'INVALID_URL' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}&format=json`;
    const response = await fetch(oembedUrl, { signal: controller.signal });
    if (!response.ok) return NextResponse.json({ error: 'VIDEO_UNAVAILABLE' }, { status: response.status === 404 ? 404 : 502 });

    const data = (await response.json()) as OembedResponse;
    if (!data.title || !data.thumbnail_url) return NextResponse.json({ error: 'VIDEO_UNAVAILABLE' }, { status: 502 });

    return NextResponse.json({ id, title: data.title, channel: data.author_name ?? '', thumbnailUrl: data.thumbnail_url });
  } catch (error) {
    console.error('[chat/youtube-oembed] falhou', error);
    return NextResponse.json({ error: 'VIDEO_UNAVAILABLE' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
