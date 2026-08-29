import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { isAllowedImageContentType, MAX_IMAGE_BYTES, UPLOAD_RATE_LIMIT } from '@/lib/chat/channel';
import { deleteImage, sniffImageContentType, uploadImage } from '@/lib/chat/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`chat-upload:${user.id}`, UPLOAD_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return err(400, 'INVALID_BODY');

  if (!isAllowedImageContentType(file.type)) return err(400, 'UNSUPPORTED_CONTENT_TYPE');
  if (file.size <= 0) return err(400, 'INVALID_SIZE');
  if (file.size > MAX_IMAGE_BYTES) return err(400, 'IMAGE_TOO_LARGE');

  const body = Buffer.from(await file.arrayBuffer());

  const sniffed = sniffImageContentType(body);
  if (!sniffed) return err(400, 'INVALID_IMAGE_BYTES');

  const uploaded = await uploadImage({ authorId: user.id, contentType: sniffed, fileName: file.name, body });

  return NextResponse.json(uploaded);
}

/**
 * Limpeza de um upload que nunca virou mensagem (ver deleteImage em storage.ts)
 * — só o autor apaga, e só dentro do próprio prefixo chat/<authorId>/, nunca
 * uma key arbitrária.
 */
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const key = new URL(req.url).searchParams.get('key');
  if (!key || !key.startsWith(`chat/${user.id}/`)) return err(400, 'INVALID_KEY');

  await deleteImage(key).catch(() => {});
  return NextResponse.json({ ok: true });
}
