import { Prisma } from '@prisma/client';
import { publicImageUrl } from '@/lib/chat/imageUrl';

const REPLY_EXCERPT_LENGTH = 120;

export const MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true, avatar: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      imageKey: true,
      deletedAt: true,
      author: { select: { username: true, avatar: true } },
    },
  },
  mentions: { select: { user: { select: { id: true, username: true, avatar: true } } } },
} satisfies Prisma.TextMessageInclude;

export type MessageWithRelations = Prisma.TextMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export interface MessageDTO {
  id: string;
  channelId: string;
  content: string | null;
  image: { url: string; width: number; height: number; bytes: number } | null;
  author: { id: string; username: string; avatar: string };
  /** true quando a mensagem tem replyToId, mesmo que replyTo abaixo esteja null (citação indisponível — ver A24). */
  hasReply: boolean;
  replyTo: { id: string; authorUsername: string; authorAvatar: string; excerpt: string; hasImage: boolean } | null;
  mentions: { id: string; username: string; avatar: string }[];
  createdAt: string;
}

export function toMessageDTO(row: MessageWithRelations): MessageDTO {
  // replyTo aponta pra linha ainda existente mesmo quando "apagada" (soft
  // delete não passa pelo DELETE do Postgres, então o SetNull da FK não
  // dispara) — tratar deletedAt aqui é o que faz a UI cair em "mensagem
  // indisponível" (ver A24) em vez de mostrar o conteúdo de algo apagado.
  const replyTo =
    row.replyTo && !row.replyTo.deletedAt
      ? {
          id: row.replyTo.id,
          authorUsername: row.replyTo.author.username,
          authorAvatar: row.replyTo.author.avatar,
          excerpt: (row.replyTo.content ?? '').slice(0, REPLY_EXCERPT_LENGTH),
          hasImage: Boolean(row.replyTo.imageKey),
        }
      : null;

  return {
    id: row.id,
    channelId: row.channelId,
    content: row.content,
    image:
      row.imageKey && row.imageWidth && row.imageHeight && row.imageBytes != null
        ? { url: publicImageUrl(row.imageKey), width: row.imageWidth, height: row.imageHeight, bytes: row.imageBytes }
        : null,
    author: row.author,
    hasReply: row.replyToId !== null,
    replyTo,
    mentions: row.mentions.map((mention) => mention.user),
    createdAt: row.createdAt.toISOString(),
  };
}
