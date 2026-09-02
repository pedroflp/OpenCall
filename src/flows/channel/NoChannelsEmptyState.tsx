'use client';

import { useSession } from 'next-auth/react';
import { ChannelType } from '@prisma/client';
import { HugeIcon } from '@/components/HugeIcon';
import ChannelDialog from '@/components/VoiceDock/ChannelDialog';
import { cn } from '@/lib/utils';

const COPY: Record<ChannelType, { icon: string; title: string; description: string }> = {
  [ChannelType.VOICE]: {
    icon: 'call-add-02',
    title: 'Nenhum canal de voz ainda',
    description: 'Crie o primeiro canal pra começar a chamar a turma.',
  },
  [ChannelType.TEXT]: {
    icon: 'chat-add-01',
    title: 'Nenhum canal de texto ainda',
    description: 'Crie o primeiro canal pra começar a conversar.',
  },
};

/**
 * Estado vazio de "ainda não existe NENHUM canal desse tipo" — não confundir
 * com id de canal inválido/apagado (ver fallback "Canal não encontrado" em
 * ChannelPage/TextChannelPage). Só quem pode criar canal (isChannelsAdmin) vê
 * o card clicável; quem não pode só vê o aviso, sem prometer uma ação que ia
 * dar 403 no clique.
 */
export default function NoChannelsEmptyState({ type }: { type: ChannelType }) {
  const { data: session } = useSession();
  const isChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);
  const { icon, title, description } = COPY[type];

  const card = (
    <div
      role={isChannelsAdmin ? 'button' : undefined}
      tabIndex={isChannelsAdmin ? 0 : undefined}
      className={cn(
        'group flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-gradient-to-b from-muted/50 to-transparent px-10 py-12 text-center transition-colors',
        isChannelsAdmin && 'cursor-pointer hover:border-primary/50 hover:bg-muted/70'
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
        <HugeIcon name={icon} size={30} />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {isChannelsAdmin && (
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105">
          <HugeIcon name="add-01" size={16} />
          Criar canal
        </span>
      )}
    </div>
  );

  return (
    <main className="flex h-full flex-col items-center justify-center p-6">
      {isChannelsAdmin ? <ChannelDialog defaultType={type} trigger={card} /> : card}
    </main>
  );
}
