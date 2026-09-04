// Constantes puras — importado também por componentes client (MessageComposer,
// useChatAttachment, useChatUnread), então nada aqui pode puxar Prisma. As
// funções de leitura de canal de texto (DB-backed) ficam em ./textChannels.

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGES_DEFAULT_PAGE_SIZE = 50;
export const MESSAGES_MAX_PAGE_SIZE = 100;
export const UNREAD_COUNT_DISPLAY_CAP = 99;

/** Tamanho máximo de um /clear — evita apagar o canal inteiro num tiro só. */
export const CLEAR_COMMAND_MAX_COUNT = 10;

/** Teto de @menções por mensagem — evita spam de "marcar todo mundo". */
export const MAX_MENTIONS_PER_MESSAGE = 20;

// Tetos e classificação de anexo agora ficam em ./attachments — a allowlist de
// imagem que morava aqui virou classificador quando o chat passou a aceitar
// qualquer arquivo (ver ADR-0013).

export const SEND_MESSAGE_RATE_LIMIT = { windowMs: 10_000, max: 10 };
export const UPLOAD_RATE_LIMIT = { windowMs: 60_000, max: 20 };
export const TYPING_RATE_LIMIT = { windowMs: 2_000, max: 1 };

/** Busca de GIF sai a cada tecla (com debounce) — teto mais folgado que o de envio. */
export const GIPHY_SEARCH_RATE_LIMIT = { windowMs: 10_000, max: 20 };
/** Um oEmbed por link do YouTube citado — teto folgado, mesma faixa da busca de GIF. */
export const YOUTUBE_OEMBED_RATE_LIMIT = { windowMs: 10_000, max: 20 };
