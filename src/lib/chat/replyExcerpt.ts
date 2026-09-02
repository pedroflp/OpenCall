import { soleGifUrl } from '@/lib/chat/gifUrl';

const REPLY_EXCERPT_LENGTH = 120;

/**
 * Trecho da mensagem citada. Corta na última palavra inteira que couber e
 * marca com reticências — sem isso o preview termina no meio da palavra e
 * parece bug, não corte (o `truncate` do CSS só cobre o que estoura a linha).
 */
export function replyExcerpt(content: string | null | undefined): string {
  // Mensagem que é só um GIF: citar a URL crua não diz nada pra quem lê.
  if (soleGifUrl(content)) return 'GIF';

  const normalized = (content ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= REPLY_EXCERPT_LENGTH) return normalized;

  const cut = normalized.slice(0, REPLY_EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > REPLY_EXCERPT_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
