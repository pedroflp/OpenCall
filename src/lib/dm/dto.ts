import { Prisma } from '@prisma/client';
import { toAttachmentDTO, type BaseMessageDTO } from '@/lib/chat/dto';
import { replyExcerpt } from '@/lib/chat/replyExcerpt';
import { channelsIdentity, PROFILE_MASK_SELECT } from '@/lib/profile/identity';

/**
 * Mesmo raciocínio de MESSAGE_INCLUDE (lib/chat/dto.ts): autor e autor da
 * citação carregam a MÁSCARA DE PERFIL, resolvida na leitura. Sem `mentions`
 * — não existe @menção dentro de DM.
 */
export const DIRECT_MESSAGE_INCLUDE = {
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
} satisfies Prisma.DirectMessageInclude;

export type DirectMessageWithRelations = Prisma.DirectMessageGetPayload<{ include: typeof DIRECT_MESSAGE_INCLUDE }>;

/**
 * Devolve o mesmo `BaseMessageDTO` do canal geral — o client (MessageList,
 * MessageItem, MessageContent) é compartilhado entre os dois e não sabe a
 * origem da mensagem. `mentions` sempre vazio (sem @menção em DM).
 */
export function toDirectMessageDTO(row: DirectMessageWithRelations): BaseMessageDTO {
  const replyAuthor = row.replyTo ? channelsIdentity(row.replyTo.author) : null;

  const replyTo =
    row.replyTo && replyAuthor && !row.replyTo.deletedAt
      ? {
          id: row.replyTo.id,
          authorId: row.replyTo.author.id,
          authorUsername: replyAuthor.username,
          authorAvatar: replyAuthor.avatar,
          excerpt: replyExcerpt(row.replyTo.content),
          attachmentKind: row.replyTo.attachmentKind,
        }
      : null;

  return {
    id: row.id,
    content: row.content,
    attachment: toAttachmentDTO(row),
    author: { id: row.author.id, ...channelsIdentity(row.author) },
    hasReply: row.replyToId !== null,
    replyTo,
    mentions: [],
    createdAt: row.createdAt.toISOString(),
  };
}
