import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { sendDiscordChannelMessage } from '@/lib/discord/bot';
import { buildInviteMessage } from '@/lib/discord/inviteMessage';
import { checkRateLimit } from '@/lib/rtc/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/** Evita spam repetido no canal do servidor — mais folgado que a cooldown por-alvo do DM (aqui só existe um alvo, o canal). */
const CHANNEL_INVITE_RATE_LIMIT = { windowMs: 60_000, max: 1 };

// Rota debaixo de /api/rtc pra herdar o gate de canalAccess do middleware —
// só quem já tem acesso ao canal pode postar o convite no bate-papo do servidor.
export async function POST(_req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const channelId = process.env.DISCORD_CHAT_CHANNEL_ID;
  if (!channelId) return err(503, 'CHANNEL_NOT_CONFIGURED');

  const { allowed, retryAfterMs } = checkRateLimit(`invite-channel:${user.id}`, CHANNEL_INVITE_RATE_LIMIT);
  if (!allowed) return NextResponse.json({ error: 'COOLDOWN', retryAfterMs }, { status: 429 });

  try {
    await sendDiscordChannelMessage(channelId, buildInviteMessage(user));
  } catch (error) {
    console.error('[rtc/invite/channel] failed to send Discord message:', error);
    return err(502, 'SEND_FAILED');
  }

  return NextResponse.json({ success: true });
}
