import { Prisma } from '@prisma/client';
import { publicImageUrl } from '@/lib/chat/imageUrl';
import { channelsIdentity, PROFILE_MASK_SELECT } from '@/lib/profile/identity';
import { replyExcerpt } from '@/lib/chat/replyExcerpt';
import { fileNameFromKey, type AttachmentKind } from '@/lib/chat/attachments';

/**
 * Autor, autor da citação e mencionados carregam os campos da MÁSCARA DE
 * PERFIL, não `username`/`avatar` crus: quem tem apelido aparece com ele —
 * inclusive nas mensagens antigas. A máscara é resolvida na LEITURA (é isso que
 * ela é), então trocar de apelido reescreve o histórico inteiro. Congelar o
 * nome por mensagem seria copiar identidade em cada linha da tabela, que é
 * justamente o que o join por id evita.
 */
export const MESSAGE_INCLUDE = {
  author: { select: { id: true, ...PROFILE_MASK_SELECT } },
  replyTo: {
    select: {
      id: true,
      content: true,
      attachmentKind: true,
      deletedAt: true,
      author: { select: { id: true, ...PROFILE_MASK_SELECT } },
    },
  },
  mentions: { select: { user: { select: { id: true, ...PROFILE_MASK_SELECT } } } },
} satisfies Prisma.TextMessageInclude;

export type MessageWithRelations = Prisma.TextMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export interface AttachmentDTO {
  kind: AttachmentKind;
  url: string;
  name: string;
  mime: string;
  bytes: number;
  /** IMAGE/VIDEO — reserva a caixa antes de o arquivo carregar. Null no resto (e nas linhas antigas sem dimensão). */
  width: number | null;
  height: number | null;
  /** VIDEO/AUDIO — mostra a duração antes do primeiro play. */
  durationMs: number | null;
}

/**
 * Forma compartilhada entre mensagem de canal e de DM (ver lib/dm/dto.ts) — os
 * componentes de exibição (MessageItem, MessageList, MessageContent) são os
 * MESMOS nos dois casos e nunca leem `channelId`, só o que está aqui. DM não
 * tem @menção (sempre `mentions: []`), mas satisfaz o mesmo shape.
 */
export interface BaseMessageDTO {
  id: string;
  content: string | null;
  attachment: AttachmentDTO | null;
  author: { id: string; username: string; avatar: string };
  /** true quando a mensagem tem replyToId, mesmo que replyTo abaixo esteja null (citação indisponível — ver A24). */
  hasReply: boolean;
  replyTo: {
    id: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string;
    excerpt: string;
    /** Null quando a citada não tem anexo — a tira mostra "Imagem"/"Vídeo"/"Áudio"/"Arquivo" conforme a espécie. */
    attachmentKind: AttachmentKind | null;
  } | null;
  mentions: { id: string; username: string; avatar: string }[];
  createdAt: string;
}

export interface MessageDTO extends BaseMessageDTO {
  channelId: string;
}

/** Campos de anexo — mesmas colunas em TextMessage e DirectMessage (ver lib/dm/dto.ts), daí virar função exportada em vez de ficar presa a MessageWithRelations. */
export interface AttachmentColumns {
  attachmentKey: string | null;
  attachmentKind: AttachmentKind | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentBytes: number | null;
  attachmentWidth: number | null;
  attachmentHeight: number | null;
  attachmentDurationMs: number | null;
}

export function toAttachmentDTO(row: AttachmentColumns): AttachmentDTO | null {
  if (!row.attachmentKey || !row.attachmentKind || row.attachmentBytes == null) return null;

  return {
    kind: row.attachmentKind,
    url: publicImageUrl(row.attachmentKey),
    name: row.attachmentName || fileNameFromKey(row.attachmentKey),
    mime: row.attachmentMime ?? 'application/octet-stream',
    bytes: row.attachmentBytes,
    width: row.attachmentWidth,
    height: row.attachmentHeight,
    durationMs: row.attachmentDurationMs,
  };
}

export function toMessageDTO(row: MessageWithRelations): MessageDTO {
  // replyTo aponta pra linha ainda existente mesmo quando "apagada" (soft
  // delete não passa pelo DELETE do Postgres, então o SetNull da FK não
  // dispara) — tratar deletedAt aqui é o que faz a UI cair em "mensagem
  // indisponível" (ver A24) em vez de mostrar o conteúdo de algo apagado.
  const replyAuthor = row.replyTo ? channelsIdentity(row.replyTo.author) : null;

  const replyTo =
    row.replyTo && replyAuthor && !row.replyTo.deletedAt
      ? {
          id: row.replyTo.id,
          // O id do autor da citação viaja junto pro cliente conseguir aplicar
          // a troca de apelido nas mensagens que já estão na tela (ver o evento
          // `profile` em useChatMessages) — sem ele, a citação ficaria com o
          // nome antigo até a próxima carga.
          authorId: row.replyTo.author.id,
          authorUsername: replyAuthor.username,
          authorAvatar: replyAuthor.avatar,
          excerpt: replyExcerpt(row.replyTo.content),
          attachmentKind: row.replyTo.attachmentKind,
        }
      : null;

  return {
    id: row.id,
    channelId: row.channelId,
    content: row.content,
    attachment: toAttachmentDTO(row),
    author: { id: row.author.id, ...channelsIdentity(row.author) },
    hasReply: row.replyToId !== null,
    replyTo,
    mentions: row.mentions.map((mention) => ({ id: mention.user.id, ...channelsIdentity(mention.user) })),
    createdAt: row.createdAt.toISOString(),
  };
}
