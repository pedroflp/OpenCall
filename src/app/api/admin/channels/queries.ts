import { prisma } from '@/services/prisma';
import type { AdminChannelDTO } from './types';

/** Lista TODOS os canais — só a UI de admin usa isso, sem passar pelo cache curto de lib/rtc/channels. Inclui a contagem de mensagens pro aviso do hard-delete (ver ADR-0003 revisada). */
export async function listAdminChannels(): Promise<AdminChannelDTO[]> {
  const rows = await prisma.channel.findMany({
    orderBy: [{ type: 'asc' }, { sortIndex: 'asc' }],
    include: { _count: { select: { textMessages: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    maxParticipants: row.maxParticipants,
    sortIndex: row.sortIndex,
    createdAt: row.createdAt.toISOString(),
    messageCount: row._count.textMessages,
  }));
}
