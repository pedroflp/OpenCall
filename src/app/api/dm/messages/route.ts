import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { encodeCursor, decodeCursor } from '@/lib/chat/cursor';
import { headAttachment } from '@/lib/chat/storage';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_DURATION_MS } from '@/lib/chat/attachments';
import { MESSAGE_MAX_LENGTH, MESSAGES_DEFAULT_PAGE_SIZE, MESSAGES_MAX_PAGE_SIZE, SEND_MESSAGE_RATE_LIMIT } from '@/lib/chat/channel';
import { getConversationForParticipant } from '@/lib/dm/access';
import { DIRECT_MESSAGE_INCLUDE, toDirectMessageDTO } from '@/lib/dm/dto';
import { publishToParticipants } from '@/lib/dm/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Teto de sanidade pra dimensão vinda do cliente — 8K de lado cobre qualquer mídia real (mesmo teto de /api/chat/messages). */
const MAX_MEDIA_DIMENSION = 8192;

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId');
  if (!conversationId) return err(400, 'MISSING_CONVERSATION');

  // Checagem de participante ANTES de qualquer outra coisa — 404 uniforme,
  // nunca 403, pra não confirmar pra quem não participa que a conversa existe.
  const conversation = await getConversationForParticipant(conversationId, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  const rawCursor = url.searchParams.get('cursor');
  const rawLimit = url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(rawLimit) || MESSAGES_DEFAULT_PAGE_SIZE, 1), MESSAGES_MAX_PAGE_SIZE);

  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return err(400, 'INVALID_CURSOR');

  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: conversation.id,
      deletedAt: null,
      ...(cursor && {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: DIRECT_MESSAGE_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return NextResponse.json({
    messages: page.map(toDirectMessageDTO),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  });
}

interface PostBody {
  conversationId?: unknown;
  content?: unknown;
  attachment?: unknown;
  replyToId?: unknown;
  clientNonce?: unknown;
}

interface AttachmentInput {
  key: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Inteiro positivo abaixo do teto, ou null — qualquer outra coisa é descartada em silêncio, não invalida a mensagem. */
function optionalDimension(raw: unknown, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.round(raw), max);
}

/**
 * Mesmo prefixo do canal geral (chat/<authorId>/...) — o upload é a MESMA
 * rota (/api/chat/uploads), reaproveitada sem mudança. Do corpo só saem a
 * chave e os metadados de apresentação; espécie/mime/tamanho/nome vêm do
 * HeadObject logo abaixo, do objeto de verdade (ver ADR-0013).
 */
function parseAttachment(raw: unknown, authorId: string): AttachmentInput | null | 'INVALID' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') return 'INVALID';

  const { key, width, height, durationMs } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || !key.startsWith(`chat/${authorId}/`)) return 'INVALID';

  return {
    key,
    width: optionalDimension(width, MAX_MEDIA_DIMENSION),
    height: optionalDimension(height, MAX_MEDIA_DIMENSION),
    durationMs: optionalDimension(durationMs, MAX_ATTACHMENT_DURATION_MS),
  };
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) return err(400, 'INVALID_BODY');

  if (typeof body.conversationId !== 'string' || !body.conversationId) return err(400, 'MISSING_CONVERSATION');
  const conversation = await getConversationForParticipant(body.conversationId, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  const { allowed, retryAfterMs } = checkRateLimit(`dm-send:${user.id}`, SEND_MESSAGE_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  if (typeof body.clientNonce !== 'string' || !body.clientNonce) return err(400, 'MISSING_CLIENT_NONCE');

  const content = typeof body.content === 'string' ? body.content.trim() : null;
  if (content && content.length > MESSAGE_MAX_LENGTH) return err(400, 'CONTENT_TOO_LONG');

  const attachmentInput = parseAttachment(body.attachment, user.id);
  if (attachmentInput === 'INVALID') return err(400, 'INVALID_ATTACHMENT');

  if (!content && !attachmentInput) return err(400, 'EMPTY_MESSAGE');

  const attachment = attachmentInput ? await headAttachment(attachmentInput.key) : null;
  if (attachmentInput && !attachment) return err(400, 'ATTACHMENT_NOT_FOUND');
  if (attachment && attachment.bytes > MAX_ATTACHMENT_BYTES[attachment.kind]) return err(400, 'ATTACHMENT_TOO_LARGE');

  const hasSize = attachment?.kind === 'IMAGE' || attachment?.kind === 'VIDEO';
  const hasDuration = attachment?.kind === 'VIDEO' || attachment?.kind === 'AUDIO';

  let replyToId: string | null = null;
  if (body.replyToId !== undefined && body.replyToId !== null) {
    if (typeof body.replyToId !== 'string') return err(400, 'INVALID_REPLY');
    // Precisa pertencer à MESMA conversationId, não só existir — senão um
    // participante da conversa X poderia citar mensagem de outra conversa da
    // qual ele nem participa.
    const replyTarget = await prisma.directMessage.findUnique({
      where: { id: body.replyToId },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!replyTarget || replyTarget.conversationId !== conversation.id || replyTarget.deletedAt) return err(400, 'REPLY_NOT_FOUND');
    replyToId = replyTarget.id;
  }

  const [created] = await prisma.$transaction([
    prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        authorId: user.id,
        content: content || null,
        attachmentKind: attachment?.kind,
        attachmentKey: attachmentInput?.key,
        attachmentName: attachment?.name,
        attachmentMime: attachment?.mime,
        attachmentBytes: attachment?.bytes,
        attachmentWidth: hasSize ? attachmentInput?.width : null,
        attachmentHeight: hasSize ? attachmentInput?.height : null,
        attachmentDurationMs: hasDuration ? attachmentInput?.durationMs : null,
        replyToId,
      },
      include: DIRECT_MESSAGE_INCLUDE,
    }),
    prisma.directConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }),
  ]);

  const dto = toDirectMessageDTO(created);
  const clientNonce = body.clientNonce;

  // Publica pros dois participantes, sem excluir o autor — a outra aba do
  // próprio autor também precisa da confirmação, e ela dedupe pelo clientNonce.
  publishToParticipants(conversation, { type: 'message', conversationId: conversation.id, message: dto, clientNonce });

  return NextResponse.json({ ...dto, clientNonce });
}
