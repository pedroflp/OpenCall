import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { MESSAGE_INCLUDE, toMessageDTO } from '@/lib/chat/dto';
import { encodeCursor, decodeCursor } from '@/lib/chat/cursor';
import { publishToChannel } from '@/lib/chat/signal';
import { getTextChannel } from '@/lib/chat/textChannels';
import { headAttachment } from '@/lib/chat/storage';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_DURATION_MS } from '@/lib/chat/attachments';
import {
  MAX_MENTIONS_PER_MESSAGE,
  MESSAGE_MAX_LENGTH,
  MESSAGES_DEFAULT_PAGE_SIZE,
  MESSAGES_MAX_PAGE_SIZE,
  SEND_MESSAGE_RATE_LIMIT,
} from '@/lib/chat/channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Teto de sanidade pra dimensão vinda do cliente — 8K de lado cobre qualquer mídia real. */
const MAX_MEDIA_DIMENSION = 8192;

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const url = new URL(req.url);
  const channelId = url.searchParams.get('channelId');
  if (!channelId) return err(400, 'MISSING_CHANNEL');
  if (!(await getTextChannel(channelId))) return err(404, 'CHANNEL_NOT_FOUND');

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { chatBlocked: true } });

  const rawCursor = url.searchParams.get('cursor');
  const rawLimit = url.searchParams.get('limit');

  const limit = Math.min(Math.max(Number(rawLimit) || MESSAGES_DEFAULT_PAGE_SIZE, 1), MESSAGES_MAX_PAGE_SIZE);

  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return err(400, 'INVALID_CURSOR');

  const rows = await prisma.textMessage.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(cursor && {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: MESSAGE_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return NextResponse.json({
    messages: page.map(toMessageDTO),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    blocked: me?.chatBlocked ?? false,
  });
}

interface PostBody {
  channelId?: unknown;
  content?: unknown;
  attachment?: unknown;
  replyToId?: unknown;
  clientNonce?: unknown;
  mentionedUserIds?: unknown;
}

/** Dedupe + valida contra usuários reais — o client manda quem foi selecionado no popover, aqui só se confirma que existem. */
async function resolveMentionedUserIds(raw: unknown): Promise<string[] | 'INVALID'> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) return 'INVALID';

  const ids = [...new Set(raw as string[])].slice(0, MAX_MENTIONS_PER_MESSAGE);
  if (ids.length === 0) return [];

  const existing = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return existing.map((user) => user.id);
}

interface AttachmentInput {
  key: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Inteiro positivo abaixo do teto, ou null — qualquer outra coisa (negativo, NaN, string) é descartada em silêncio, não invalida a mensagem. */
function optionalDimension(raw: unknown, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.round(raw), max);
}

/**
 * Do corpo só saem a chave e os metadados de APRESENTAÇÃO (dimensão e
 * duração): espécie, mime, tamanho e nome vêm do HeadObject logo abaixo, do
 * objeto de verdade (ver §5.4 da RFC de anexos).
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

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { chatBlocked: true } });
  if (me?.chatBlocked) return err(403, 'BLOCKED');

  const { allowed, retryAfterMs } = checkRateLimit(`chat-send:${user.id}`, SEND_MESSAGE_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) return err(400, 'INVALID_BODY');

  if (typeof body.channelId !== 'string' || !body.channelId) return err(400, 'MISSING_CHANNEL');
  if (!(await getTextChannel(body.channelId))) return err(404, 'CHANNEL_NOT_FOUND');
  const channelId = body.channelId;

  if (typeof body.clientNonce !== 'string' || !body.clientNonce) return err(400, 'MISSING_CLIENT_NONCE');

  const content = typeof body.content === 'string' ? body.content.trim() : null;
  if (content && content.length > MESSAGE_MAX_LENGTH) return err(400, 'CONTENT_TOO_LONG');

  const attachmentInput = parseAttachment(body.attachment, user.id);
  if (attachmentInput === 'INVALID') return err(400, 'INVALID_ATTACHMENT');

  if (!content && !attachmentInput) return err(400, 'EMPTY_MESSAGE');

  // A espécie e o tamanho de verdade só se sabem aqui — e o Head também é o que
  // confirma que a chave existe mesmo (chave inventada com o prefixo certo
  // viraria anexo quebrado pra sempre).
  const attachment = attachmentInput ? await headAttachment(attachmentInput.key) : null;
  if (attachmentInput && !attachment) return err(400, 'ATTACHMENT_NOT_FOUND');
  if (attachment && attachment.bytes > MAX_ATTACHMENT_BYTES[attachment.kind]) return err(400, 'ATTACHMENT_TOO_LARGE');

  const hasSize = attachment?.kind === 'IMAGE' || attachment?.kind === 'VIDEO';
  const hasDuration = attachment?.kind === 'VIDEO' || attachment?.kind === 'AUDIO';

  let replyToId: string | null = null;
  if (body.replyToId !== undefined && body.replyToId !== null) {
    if (typeof body.replyToId !== 'string') return err(400, 'INVALID_REPLY');
    const replyTarget = await prisma.textMessage.findUnique({
      where: { id: body.replyToId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    if (!replyTarget || replyTarget.channelId !== channelId || replyTarget.deletedAt) return err(400, 'REPLY_NOT_FOUND');
    replyToId = replyTarget.id;
  }

  const mentionedUserIds = await resolveMentionedUserIds(body.mentionedUserIds);
  if (mentionedUserIds === 'INVALID') return err(400, 'INVALID_MENTIONS');

  const created = await prisma.textMessage.create({
    data: {
      channelId,
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
      mentions: mentionedUserIds.length ? { create: mentionedUserIds.map((userId) => ({ userId })) } : undefined,
    },
    include: MESSAGE_INCLUDE,
  });

  const dto = toMessageDTO(created);
  const clientNonce = body.clientNonce;

  // Broadcast pra todos, inclusive o autor — o autor deduplica pelo nonce
  // contra a mensagem otimista já renderizada (ver useChatMessages). O
  // client filtra pelo channelId (ver ADR-0006 — sem SSE por canal).
  publishToChannel({ type: 'message', channelId, message: dto, clientNonce });

  return NextResponse.json({ ...dto, clientNonce });
}
