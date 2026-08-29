import { NextRequest, NextResponse } from 'next/server';
import { getUser, isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { moveImageToDeleted } from '@/lib/chat/storage';
import { publishToChannel } from '@/lib/chat/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const message = await prisma.textMessage.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, imageKey: true, createdAt: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return err(404, 'NOT_FOUND');

  const isAuthor = message.authorId === user.id;
  if (!isAuthor && !(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const deletedAt = new Date();

  // Zero linhas afetadas (já apagada em paralelo) — não republica um segundo evento.
  const result = await prisma.textMessage.updateMany({
    where: { id: message.id, deletedAt: null },
    data: { deletedAt, deletedBy: user.id },
  });
  if (result.count === 0) return err(404, 'NOT_FOUND');

  publishToChannel({ type: 'deleted', id: message.id });

  if (message.imageKey) {
    moveImageToDeleted({
      key: message.imageKey,
      deletedBy: user.id,
      deletedAt,
      fallbackAuthorId: message.authorId,
      fallbackUploadedAt: message.createdAt,
    }).catch((error) => console.error('[chat/messages/DELETE] failed to move image to deleted prefix', error));
  }

  return new NextResponse(null, { status: 204 });
}
