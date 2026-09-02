/**
 * Reconhecimento de link de vídeo do YouTube — usado tanto no embed (client)
 * quanto na rota de oEmbed (servidor), então nada de React nem Prisma aqui.
 */

const WATCH_HOST_RE = /^(?:www\.|m\.)?youtube\.com$/i;
const SHORT_HOST_RE = /^youtu\.be$/i;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function parse(raw: string): URL | null {
  try {
    const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** Extrai o id de 11 caracteres de qualquer formato de link do YouTube (watch, youtu.be, shorts, embed, live). */
export function youtubeVideoId(raw: string): string | null {
  const url = parse(raw);
  if (!url) return null;

  if (SHORT_HOST_RE.test(url.hostname)) {
    const id = url.pathname.replace(/^\/+/, '').split('/')[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (WATCH_HOST_RE.test(url.hostname)) {
    const segments = url.pathname.replace(/^\/+/, '').split('/');
    if (segments[0] === 'watch') {
      const id = url.searchParams.get('v') ?? '';
      return VIDEO_ID_RE.test(id) ? id : null;
    }
    if (['shorts', 'embed', 'live'].includes(segments[0]) && segments[1]) {
      return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Link de vídeo sozinho na mensagem — mesmo critério do GIF (ver gifUrl.ts): sem espaço em volta. */
export function soleYoutubeVideoId(content: string | null | undefined): string | null {
  const trimmed = (content ?? '').trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return youtubeVideoId(trimmed);
}
