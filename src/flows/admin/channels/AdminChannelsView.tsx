'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChannelType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';
import ChannelDialog from '@/components/VoiceDock/ChannelDialog';
import ChannelCard from './ChannelCard';

function sortChannels(channels: AdminChannelDTO[]) {
  return [...channels].sort((a, b) => a.sortIndex - b.sortIndex);
}

function ChannelSection({
  title,
  channels,
  onChannelUpdated,
  onChannelDeleted,
}: {
  title: string;
  channels: AdminChannelDTO[];
  onChannelUpdated: (channel: AdminChannelDTO) => void;
  onChannelDeleted: (channelId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {channels.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Nenhum canal criado ainda.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} onChannelUpdated={onChannelUpdated} onChannelDeleted={onChannelDeleted} />
        ))}
      </div>
    </div>
  );
}

export default function AdminChannelsView({ channels: initialChannels }: { channels: AdminChannelDTO[] }) {
  const router = useRouter();
  // Estado local otimista — mesmo padrão de AdminGroupsView.
  const [channels, setChannels] = useState(() => sortChannels(initialChannels));

  useEffect(() => setChannels(sortChannels(initialChannels)), [initialChannels]);

  function handleChannelCreated(channel: AdminChannelDTO) {
    setChannels((prev) => sortChannels([...prev, channel]));
    router.refresh();
  }

  function handleChannelUpdated(channel: AdminChannelDTO) {
    setChannels((prev) => sortChannels(prev.map((c) => (c.id === channel.id ? channel : c))));
    router.refresh();
  }

  function handleChannelDeleted(channelId: string) {
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    router.refresh();
  }

  const voiceChannels = channels.filter((channel) => channel.type === ChannelType.VOICE);
  const textChannels = channels.filter((channel) => channel.type === ChannelType.TEXT);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Canais</h1>
          <p className="text-sm text-muted-foreground">Crie, edite e exclua canais de voz e de texto.</p>
        </div>

        <ChannelDialog
          defaultType={ChannelType.VOICE}
          onSaved={handleChannelCreated}
          trigger={
            <Button className="gap-2">
              <HugeIcon name="add-01" size={16} />
              Novo canal
            </Button>
          }
        />
      </div>

      <ChannelSection
        title="Canais de voz"
        channels={voiceChannels}
        onChannelUpdated={handleChannelUpdated}
        onChannelDeleted={handleChannelDeleted}
      />
      <ChannelSection
        title="Canais de texto"
        channels={textChannels}
        onChannelUpdated={handleChannelUpdated}
        onChannelDeleted={handleChannelDeleted}
      />
    </main>
  );
}
