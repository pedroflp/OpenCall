// Constantes e classificação de anexo — puro, sem Prisma e sem Buffer, porque
// é importado tanto pelas rotas quanto por componente client (compositor,
// players, mensagem otimista). Os farejadores de magic bytes ficam em
// ./storage (server-only, dependem de Buffer).
//
// Ver docs/rfc-anexos-de-arquivo.md e ADR-0013.

/** Espelha o enum AttachmentKind do Prisma — mesmos literais, sem importar @prisma/client no bundle do client. */
export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';

// O RÓTULO da espécie ("Imagem", "Vídeo"…) não mora mais aqui: virou
// `chat.attachmentKind.<ESPÉCIE>` no catálogo, indexado pelos mesmos literais
// do tipo acima. Este módulo é importado por rota de API, e traduzir ali seria
// escolher a língua de quem enviou, não a de quem lê.

/** Ícone do HugeIcon usado pra representar a espécie fora do player (tira de citação, preview do compositor). */
export const ATTACHMENT_KIND_ICON: Record<AttachmentKind, string> = {
  IMAGE: 'image-01',
  VIDEO: 'video-01',
  AUDIO: 'music-note-01',
  FILE: 'file-02',
};

/**
 * Teto por espécie, não um teto único: imagem continua em 10MB porque passa
 * pelo otimizador do next/image, e vídeo precisa de folga pra valer a pena sem
 * transcodificação (ver §5.2 da RFC).
 */
export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
  FILE: 50 * 1024 * 1024,
};

/** Corte grosso antes de saber a espécie (o sniff só acontece depois do primeiro chunk). */
export const MAX_ANY_ATTACHMENT_BYTES = Math.max(...Object.values(MAX_ATTACHMENT_BYTES));

/** Duração aceita num anexo de mídia — 12h, generoso o bastante pra qualquer gravação e apertado o bastante pra rejeitar lixo. */
export const MAX_ATTACHMENT_DURATION_MS = 12 * 60 * 60 * 1000;

/**
 * Só o que browser toca de verdade. `.mkv`, `.avi` e `.heic` ficam de fora de
 * propósito — sem entrada aqui eles caem em FILE e viram card de download, em
 * vez de um player que nunca ia tocar (ver ADR-0013).
 */
export const MEDIA_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
};

export const OCTET_STREAM = 'application/octet-stream';

export function attachmentKindForMime(mime: string): AttachmentKind {
  if (!(mime in MEDIA_MIME_EXT)) return 'FILE';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

/**
 * Palpite pelo `file.type` do browser, que vem da extensão/registro do SO e não
 * dos bytes. Serve só pro cliente saber qual teto aplicar e que metadado tentar
 * medir — a espécie que vale é a que a rota de upload fareja (ver ADR-0013).
 */
export function guessAttachmentKind(browserType: string): AttachmentKind {
  if (browserType.startsWith('image/')) return 'IMAGE';
  if (browserType.startsWith('video/')) return 'VIDEO';
  if (browserType.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

/** `.tar.gz` devolve `gz` — a extensão é o último segmento, e é só rótulo de UI/chave. */
export function fileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return match ? match[1].toLowerCase() : '';
}

/** Extensão da chave do objeto: mídia conhecida tem uma canônica; o resto herda a do nome original, ou `bin`. */
export function objectExtensionFor(mime: string, fileName: string): string {
  return MEDIA_MIME_EXT[mime] || fileExtension(fileName) || 'bin';
}

/** Nome de exibição quando não há `attachmentName` (linhas anteriores à migração — ver ADR-0012). */
export function fileNameFromKey(key: string): string {
  return key.split('/').pop() || 'arquivo';
}

/**
 * `locale` é obrigatório porque a VÍRGULA decimal é do português: "9,4 MB" em
 * pt-BR e "9.4 MB" em en-US. Era um `.replace('.', ',')` fixo aqui dentro, que
 * numa interface em inglês escreveria o número errado. Quem chama passa o
 * locale corrente (`useLocale()`).
 */
export function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Uma casa só abaixo de 10 ("9,4 MB"), nenhuma acima ("128 MB") — precisão
  // decrescente, que é como tamanho de arquivo se lê.
  const digits = value < 10 ? 1 : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${formatted} ${units[unit]}`;
}
