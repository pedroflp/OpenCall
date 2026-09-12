import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { TYPING_RATE_LIMIT } from '@/lib/chat/channel';
import { getConversationForParticipant } from '@/lib/dm/access';
import { publishToParticipants } from '@/lib/dm/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { conversationId?: unknown } | null;
  if (typeof body?.conversationId !== 'string' || !body.conversationId) {
    return NextResponse.json({ error: 'MISSING_CONVERSATION' }, { status: 400 });
  }
  const conversationId = body.conversationId;

  const conversation = await getConversationForParticipant(conversationId, user.id);
  if (!conversation) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Escopado por conversa: sem o conversationId na chave, digitar na conversa
  // A consumiria o teto de digitar na conversa B.
  const { allowed } = checkRateLimit(`dm-typing:${user.id}:${conversationId}`, TYPING_RATE_LIMIT);
  if (allowed) {
    publishToParticipants(conversation, { type: 'typing', conversationId, user: { id: user.id, username: user.username } }, user.id);
  }

  return new NextResponse(null, { status: 204 });
}
