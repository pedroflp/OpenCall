import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { UPLOAD_RATE_LIMIT } from '@/lib/chat/channel';
import { MAX_ANY_ATTACHMENT_BYTES } from '@/lib/chat/attachments';
import { AttachmentUploadError, deleteAttachment, uploadAttachment } from '@/lib/chat/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

const FALLBACK_FILE_NAME = 'arquivo';

/** O nome é só rótulo (a chave do objeto é um uuid) — cortar aqui evita gravar um "nome" de 4KB no Postgres e na metadata. */
const FILE_NAME_MAX_LENGTH = 200;

/**
 * Corpo CRU, não multipart (ver ADR-0011): nome e tamanho vêm na query, os
 * bytes vêm no corpo e são streamados direto pro R2. Um `formData()` aqui
 * bufferizaria o vídeo inteiro em memória antes do primeiro byte sair.
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`chat-upload:${user.id}`, UPLOAD_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  const params = new URL(req.url).searchParams;
  const fileName = (params.get('name') || '').trim().slice(0, FILE_NAME_MAX_LENGTH) || FALLBACK_FILE_NAME;

  const declaredBytes = Number(params.get('size'));
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) return err(400, 'INVALID_SIZE');
  if (declaredBytes > MAX_ANY_ATTACHMENT_BYTES) return err(400, 'ATTACHMENT_TOO_LARGE');

  // `?size=` é o que vira ContentLength (o SDK precisa dele adiantado pra não
  // bufferizar). Quando o header chega — chega, o browser sempre manda pra
  // corpo de Blob — ele é a conferência de que os dois combinam.
  const headerLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(headerLength) && headerLength > 0 && headerLength !== declaredBytes) return err(400, 'SIZE_MISMATCH');

  if (!req.body) return err(400, 'INVALID_BODY');

  try {
    const uploaded = await uploadAttachment({ authorId: user.id, fileName, declaredBytes, body: req.body });
    return NextResponse.json(uploaded);
  } catch (error) {
    if (error instanceof AttachmentUploadError) return err(400, error.code, { kind: error.kind });
    console.error('[chat/uploads] failed to store attachment', error);
    return err(502, 'UPLOAD_FAILED');
  }
}

/**
 * Limpeza de um upload que nunca virou mensagem (ver deleteAttachment em
 * storage.ts) — só o autor apaga, e só dentro do próprio prefixo
 * chat/<authorId>/, nunca uma key arbitrária.
 */
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const key = new URL(req.url).searchParams.get('key');
  if (!key || !key.startsWith(`chat/${user.id}/`)) return err(400, 'INVALID_KEY');

  await deleteAttachment(key).catch(() => {});
  return NextResponse.json({ ok: true });
}
