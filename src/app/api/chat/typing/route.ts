import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { TYPING_RATE_LIMIT } from '@/lib/chat/channel';
import { getTextChannel } from '@/lib/chat/textChannels';
import { publishToChannel } from '@/lib/chat/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { channelId?: unknown } | null;
  if (typeof body?.channelId !== 'string' || !body.channelId) {
    return NextResponse.json({ error: 'MISSING_CHANNEL' }, { status: 400 });
  }
  if (!(await getTextChannel(body.channelId))) return NextResponse.json({ error: 'CHANNEL_NOT_FOUND' }, { status: 404 });
  const channelId = body.channelId;

  // Excedente é descartado silenciosamente: o client já se auto-limita (ver
  // MessageComposer), esse limite existe só contra aba maliciosa — não é erro
  // pro usuário normal, por isso sempre 204 (ver §5.5 da RFC-008).
  const { allowed } = checkRateLimit(`chat-typing:${user.id}`, TYPING_RATE_LIMIT);
  if (allowed) {
    publishToChannel({ type: 'typing', channelId, user: { id: user.id, username: user.username } }, user.id);
  }

  return new NextResponse(null, { status: 204 });
}
