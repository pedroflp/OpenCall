import { GiphyFetch } from '@giphy/js-fetch-api';

/** @giphy/js-types é dependência transitiva do SDK — tipar pelo retorno evita instalá-la só por causa do IGif. */
type GiphyGif = Awaited<ReturnType<GiphyFetch['trending']>>['data'][number];

/**
 * SDK oficial (recomendação da Giphy) rodando só no servidor: a chave fica em
 * GIPHY_API_KEY e nunca chega no browser — chave de SDK no client é pública
 * pra qualquer um no console e a cota é nossa.
 */
let client: GiphyFetch | null = null;

function giphy(): GiphyFetch {
  if (!client) {
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) throw new Error('GIPHY_API_KEY não configurada');
    client = new GiphyFetch(apiKey);
  }
  return client;
}

export const GIPHY_PAGE_SIZE = 24;
/** Sem conteúdo adulto no chat — a busca inteira é filtrada na origem. */
const RATING = 'pg-13';

export interface GifDTO {
  id: string;
  title: string;
  /** Rendition leve e animada só pra grade do popover. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** O que vira mensagem de fato. */
  url: string;
}

function toGifDTO(gif: GiphyGif): GifDTO | null {
  const preview = gif.images.fixed_width_small;
  const full = gif.images.downsized_medium ?? gif.images.downsized ?? gif.images.original;
  if (!preview?.url || !full?.url) return null;

  return {
    id: String(gif.id),
    title: gif.title || 'GIF',
    previewUrl: preview.webp || preview.url,
    previewWidth: Number(preview.width) || 100,
    previewHeight: Number(preview.height) || 100,
    url: full.url,
  };
}

/**
 * O SDK não expõe signal nem timeout e guarda a promise de cada URL num cache
 * de 60s: uma chamada que não resolve deixaria o popover girando pra sempre e
 * ainda seria reaproveitada pelas próximas. O teto aqui vira erro tratável.
 */
const REQUEST_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GIPHY_TIMEOUT')), REQUEST_TIMEOUT_MS)),
  ]);
}

export async function fetchGifs(query: string, offset: number): Promise<GifDTO[]> {
  const trimmed = query.trim();
  const result = await withTimeout(
    trimmed
      ? giphy().search(trimmed, { offset, limit: GIPHY_PAGE_SIZE, rating: RATING, lang: 'pt', type: 'gifs' })
      : giphy().trending({ offset, limit: GIPHY_PAGE_SIZE, rating: RATING, type: 'gifs' }),
  );

  return result.data.map(toGifDTO).filter((gif): gif is GifDTO => gif !== null);
}
