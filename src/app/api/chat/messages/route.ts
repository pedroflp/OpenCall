import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { MESSAGE_INCLUDE, toMessageDTO } from '@/lib/chat/dto';
import { encodeCursor, decodeCursor } from '@/lib/chat/cursor';
import { publishToChannel } from '@/lib/chat/signal';
import {
  MAX_MENTIONS_PER_MESSAGE,
  MESSAGE_MAX_LENGTH,
  MESSAGES_DEFAULT_PAGE_SIZE,
  MESSAGES_MAX_PAGE_SIZE,
  SEND_MESSAGE_RATE_LIMIT,
  TEXT_CHANNEL_ID,
} from '@/lib/chat/channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { chatBlocked: true } });

  const url = new URL(req.url);
  const rawCursor = url.searchParams.get('cursor');
  const rawLimit = url.searchParams.get('limit');

  const limit = Math.min(Math.max(Number(rawLimit) || MESSAGES_DEFAULT_PAGE_SIZE, 1), MESSAGES_MAX_PAGE_SIZE);

  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return err(400, 'INVALID_CURSOR');

  const rows = await prisma.textMessage.findMany({
    where: {
      channelId: TEXT_CHANNEL_ID,
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
  content?: unknown;
  image?: unknown;
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

interface ImageInput {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

function parseImage(raw: unknown, authorId: string): ImageInput | null | 'INVALID' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') return 'INVALID';

  const { key, width, height, bytes } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || !key.startsWith(`chat/${authorId}/`)) return 'INVALID';
  if (typeof width !== 'number' || typeof height !== 'number' || typeof bytes !== 'number') return 'INVALID';
  if (width <= 0 || height <= 0 || bytes <= 0) return 'INVALID';

  return { key, width, height, bytes };
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

  if (typeof body.clientNonce !== 'string' || !body.clientNonce) return err(400, 'MISSING_CLIENT_NONCE');

  const content = typeof body.content === 'string' ? body.content.trim() : null;
  if (content && content.length > MESSAGE_MAX_LENGTH) return err(400, 'CONTENT_TOO_LONG');

  const image = parseImage(body.image, user.id);
  if (image === 'INVALID') return err(400, 'INVALID_IMAGE');

  if (!content && !image) return err(400, 'EMPTY_MESSAGE');

  let replyToId: string | null = null;
  if (body.replyToId !== undefined && body.replyToId !== null) {
    if (typeof body.replyToId !== 'string') return err(400, 'INVALID_REPLY');
    const replyTarget = await prisma.textMessage.findUnique({
      where: { id: body.replyToId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    if (!replyTarget || replyTarget.channelId !== TEXT_CHANNEL_ID || replyTarget.deletedAt) return err(400, 'REPLY_NOT_FOUND');
    replyToId = replyTarget.id;
  }

  const mentionedUserIds = await resolveMentionedUserIds(body.mentionedUserIds);
  if (mentionedUserIds === 'INVALID') return err(400, 'INVALID_MENTIONS');

  const created = await prisma.textMessage.create({
    data: {
      channelId: TEXT_CHANNEL_ID,
      authorId: user.id,
      content: content || null,
      imageKey: image?.key,
      imageWidth: image?.width,
      imageHeight: image?.height,
      imageBytes: image?.bytes,
      replyToId,
      mentions: mentionedUserIds.length ? { create: mentionedUserIds.map((userId) => ({ userId })) } : undefined,
    },
    include: MESSAGE_INCLUDE,
  });

  const dto = toMessageDTO(created);
  const clientNonce = body.clientNonce;

  // Broadcast pra todos, inclusive o autor — o autor deduplica pelo nonce
  // contra a mensagem otimista já renderizada (ver useChatMessages).
  publishToChannel({ type: 'message', message: dto, clientNonce });

  return NextResponse.json({ ...dto, clientNonce });
}
