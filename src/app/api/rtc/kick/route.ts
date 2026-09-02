import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { getVoiceChannel } from '@/lib/rtc/channels';
import { livekitApi } from '@/lib/rtc/server';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';
import { prisma } from '@/services/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await isRtcEnabled())) return err(503, 'SERVICE_DISABLED');

  const session = await auth();
  if (!session?.user?.isChannelsAdmin) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const channelId = (body as { channelId?: unknown } | null)?.channelId;
  const identity = (body as { identity?: unknown } | null)?.identity;
  if (typeof channelId !== 'string' || typeof identity !== 'string') return err(400, 'INVALID_BODY');

  const channel = await getVoiceChannel(channelId);
  if (!channel) return err(404, 'CHANNEL_NOT_FOUND');

  // Um channels_admin sem ser ADMIN completo não pode desconectar um ADMIN —
  // só ADMIN completo tem esse poder sobre outro ADMIN (mesma régua de
  // src/lib/access.ts pro toggle de CHANNELS_ACCESS).
  if (!session.user.isAdmin) {
    const target = await prisma.user.findUnique({ where: { id: identity }, select: { roles: true } });
    if (target?.roles.includes(UserRole.ADMIN)) return err(403, 'CANNOT_DISCONNECT_ADMIN');
  }

  try {
    await livekitApi().room.removeParticipant(channel.id, identity);
  } catch {
    return err(502, 'LIVEKIT_ERROR');
  }

  return NextResponse.json({ ok: true });
}
