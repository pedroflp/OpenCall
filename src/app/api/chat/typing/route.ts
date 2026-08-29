import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { TYPING_RATE_LIMIT } from '@/lib/chat/channel';
import { publishToChannel } from '@/lib/chat/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // Excedente é descartado silenciosamente: o client já se auto-limita (ver
  // MessageComposer), esse limite existe só contra aba maliciosa — não é erro
  // pro usuário normal, por isso sempre 204 (ver §5.5 da RFC-008).
  const { allowed } = checkRateLimit(`chat-typing:${user.id}`, TYPING_RATE_LIMIT);
  if (allowed) {
    publishToChannel({ type: 'typing', user: { id: user.id, username: user.username } }, user.id);
  }

  return new NextResponse(null, { status: 204 });
}
