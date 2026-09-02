/**
 * Reconhecimento de URL de GIF — usado tanto no render da mensagem (client)
 * quanto no excerpt de citação (servidor), então não pode importar nada de
 * React nem do Prisma.
 */

const GIPHY_MEDIA_HOST_RE = /^(?:media\d*|i)\.giphy\.com$/i;
const GIPHY_PAGE_HOST_RE = /^(?:www\.)?giphy\.com$/i;
const TENOR_MEDIA_HOST_RE = /^(?:media\d*|c)\.tenor\.com$/i;
const ANIMATED_EXT_RE = /\.(?:gif|webp)$/i;
/** Slug de página do Giphy termina no id: "engracado-gato-3o7TKr3nzbh5WgCFxe". */
const GIPHY_SLUG_ID_RE = /(?:^|-)([a-zA-Z0-9]{6,})$/;

function parse(raw: string): URL | null {
  try {
    const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Devolve a URL da mídia animada quando o link é (ou aponta pra) um GIF, senão
 * null. Página do Giphy vira mídia direta porque o link que a pessoa copia do
 * site é o da página, não o do arquivo.
 */
export function gifMediaUrl(raw: string): string | null {
  const url = parse(raw);
  if (!url) return null;

  if (GIPHY_PAGE_HOST_RE.test(url.hostname)) {
    const [section, slug] = url.pathname.replace(/^\/+/, '').split('/');
    if ((section !== 'gifs' && section !== 'clips') || !slug) return null;
    const id = GIPHY_SLUG_ID_RE.exec(slug)?.[1];
    return id ? `https://media.giphy.com/media/${id}/giphy.gif` : null;
  }

  if (ANIMATED_EXT_RE.test(url.pathname)) {
    // .webp só conta em host conhecido de GIF: webp comum é imagem estática e
    // não deve virar embed animado no meio do texto.
    const isGif = /\.gif$/i.test(url.pathname);
    if (isGif || GIPHY_MEDIA_HOST_RE.test(url.hostname) || TENOR_MEDIA_HOST_RE.test(url.hostname)) return url.href;
  }

  return null;
}

/** URL de GIF sozinha na mensagem — o texto some e sobra só o embed (igual Discord). */
export function soleGifUrl(content: string | null | undefined): string | null {
  const trimmed = (content ?? '').trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return gifMediaUrl(trimmed);
}
