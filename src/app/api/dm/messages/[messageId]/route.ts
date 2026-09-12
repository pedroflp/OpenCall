import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { moveAttachmentToDeleted } from '@/lib/chat/storage';
import { getConversationForParticipant } from '@/lib/dm/access';
import { publishToParticipants } from '@/lib/dm/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function DELETE(_req: NextRequest, { params }: { params: { messageId: string } }) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const message = await prisma.directMessage.findUnique({
    where: { id: params.messageId },
    select: { id: true, conversationId: true, authorId: true, attachmentKey: true, createdAt: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return err(404, 'NOT_FOUND');

  // Checagem de participante DEPOIS de achar a mensagem, mas ANTES de
  // qualquer outra coisa — 404 uniforme pra quem não participa, mesmo
  // invariante das outras rotas de DM.
  const conversation = await getConversationForParticipant(message.conversationId, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  // Sem bypass de admin: quem não é o autor recebe 403, não 404 — a pessoa É
  // participante e sabe que a mensagem existe, só não pode apagá-la.
  if (message.authorId !== user.id) return err(403, 'FORBIDDEN');

  const deletedAt = new Date();

  // Zero linhas afetadas (já apagada em paralelo) — não republica um segundo evento.
  const result = await prisma.directMessage.updateMany({
    where: { id: message.id, deletedAt: null },
    data: { deletedAt, deletedBy: user.id },
  });
  if (result.count === 0) return err(404, 'NOT_FOUND');

  publishToParticipants(conversation, { type: 'deleted', conversationId: conversation.id, id: message.id });

  if (message.attachmentKey) {
    moveAttachmentToDeleted({
      key: message.attachmentKey,
      deletedBy: user.id,
      deletedAt,
      fallbackAuthorId: message.authorId,
      fallbackUploadedAt: message.createdAt,
    }).catch((error) => console.error('[dm/messages/DELETE] failed to move attachment to deleted prefix', error));
  }

  return new NextResponse(null, { status: 204 });
}
