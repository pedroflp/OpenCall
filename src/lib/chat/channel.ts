/**
 * Canal único da v1 (ver D1 na RFC-008) — `channel_id` já existe no schema
 * pra não exigir backfill + recriação de índice quando virar multi-canal.
 */
export const TEXT_CHANNEL_ID = 'global';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGES_DEFAULT_PAGE_SIZE = 50;
export const MESSAGES_MAX_PAGE_SIZE = 100;
export const UNREAD_COUNT_DISPLAY_CAP = 99;

/** Tamanho máximo de um /clear — evita apagar o canal inteiro num tiro só. */
export const CLEAR_COMMAND_MAX_COUNT = 10;

/** Teto de @menções por mensagem — evita spam de "marcar todo mundo". */
export const MAX_MENTIONS_PER_MESSAGE = 20;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Sem dependência de servidor de propósito — usado tanto pela rota de upload quanto pela validação no client antes de mandar o arquivo (ver §4.3 da RFC-008). */
export const IMAGE_CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isAllowedImageContentType(contentType: string): boolean {
  return contentType in IMAGE_CONTENT_TYPE_EXT;
}

export const SEND_MESSAGE_RATE_LIMIT = { windowMs: 10_000, max: 10 };
export const UPLOAD_RATE_LIMIT = { windowMs: 60_000, max: 20 };
export const TYPING_RATE_LIMIT = { windowMs: 2_000, max: 1 };
