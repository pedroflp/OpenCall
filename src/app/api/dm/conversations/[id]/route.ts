import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { prisma } from '@/services/prisma';
import { getConversationForParticipant } from '@/lib/dm/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/**
 * Remove a conversa da barra lateral de QUEM CHAMOU — não apaga mensagem
 * nenhuma nem afeta o outro participante, só marca hiddenAt na leitura dele
 * (ver DirectConversationRead no schema). Volta a aparecer sozinha quando
 * chega mensagem nova, ou explicitamente ao reabrir pelo picker de "Nova
 * mensagem direta" (POST em /api/dm/conversations zera hiddenAt de novo).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const conversation = await getConversationForParticipant(params.id, user.id);
  if (!conversation) return err(404, 'NOT_FOUND');

  await prisma.directConversationRead.upsert({
    where: { userId_conversationId: { userId: user.id, conversationId: conversation.id } },
    create: { userId: user.id, conversationId: conversation.id, hiddenAt: new Date() },
    update: { hiddenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
