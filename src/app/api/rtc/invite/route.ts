import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { DiscordApiError, sendDiscordDirectMessage } from '@/lib/discord/bot';
import { buildInviteMessage } from '@/lib/discord/inviteMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/** Evita spam de convites repetidos pro mesmo destinatário. */
const COOLDOWN_MS = 60_000;
const lastInviteAt = new Map<string, number>();

// Rota debaixo de /api/rtc pra herdar o gate de canalAccess do middleware
// (src/middleware.ts) de graça — só quem já tem acesso ao canal pode chamar
// alguém pra entrar nele.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const body = await req.json().catch(() => null);
  const targetUserId = (body as { targetUserId?: unknown } | null)?.targetUserId;
  if (typeof targetUserId !== 'string' || !targetUserId) return err(400, 'INVALID_TARGET');
  if (targetUserId === user.id) return err(400, 'CANNOT_INVITE_SELF');

  const cooldownKey = `${user.id}:${targetUserId}`;
  const lastSent = lastInviteAt.get(cooldownKey);
  if (lastSent && Date.now() - lastSent < COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'COOLDOWN', retryAfterMs: COOLDOWN_MS - (Date.now() - lastSent) },
      { status: 429 },
    );
  }

  try {
    await sendDiscordDirectMessage(targetUserId, buildInviteMessage(user));
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 403) return err(403, 'DM_BLOCKED');
    console.error('[rtc/invite] failed to send Discord DM:', error);
    return err(502, 'SEND_FAILED');
  }

  lastInviteAt.set(cooldownKey, Date.now());
  return NextResponse.json({ success: true });
}
