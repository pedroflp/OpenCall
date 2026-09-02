import { NextRequest, NextResponse } from 'next/server';
import { getUser, isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { moveImageToDeleted } from '@/lib/chat/storage';
import { publishToChannel } from '@/lib/chat/signal';
import { getTextChannel } from '@/lib/chat/textChannels';
import { CLEAR_COMMAND_MAX_COUNT } from '@/lib/chat/channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

interface ClearBody {
  channelId?: unknown;
  count?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const body = (await req.json().catch(() => null)) as ClearBody | null;
  if (typeof body?.channelId !== 'string' || !body.channelId) return err(400, 'MISSING_CHANNEL');
  if (!(await getTextChannel(body.channelId))) return err(404, 'CHANNEL_NOT_FOUND');
  const channelId = body.channelId;

  const count = typeof body?.count === 'number' ? Math.trunc(body.count) : NaN;
  if (!Number.isFinite(count) || count < 1 || count > CLEAR_COMMAND_MAX_COUNT) return err(400, 'INVALID_COUNT');

  const targets = await prisma.textMessage.findMany({
    where: { channelId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: count,
    select: { id: true, imageKey: true, authorId: true, createdAt: true },
  });
  if (targets.length === 0) return NextResponse.json({ deletedIds: [] });

  const deletedAt = new Date();
  const ids = targets.map((target) => target.id);

  await prisma.textMessage.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt, deletedBy: user.id },
  });

  publishToChannel({ type: 'cleared', channelId, ids });

  for (const target of targets) {
    if (!target.imageKey) continue;
    moveImageToDeleted({
      key: target.imageKey,
      deletedBy: user.id,
      deletedAt,
      fallbackAuthorId: target.authorId,
      fallbackUploadedAt: target.createdAt,
    }).catch((error) => console.error('[chat/messages/clear] failed to move image to deleted prefix', error));
  }

  return NextResponse.json({ deletedIds: ids });
}
