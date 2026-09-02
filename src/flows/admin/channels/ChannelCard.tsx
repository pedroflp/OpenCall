'use client';

import { ChannelType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';
import ChannelDialog from '@/components/VoiceDock/ChannelDialog';
import DeleteChannelDialog from './DeleteChannelDialog';

export default function ChannelCard({
  channel,
  onChannelUpdated,
  onChannelDeleted,
}: {
  channel: AdminChannelDTO;
  onChannelUpdated: (channel: AdminChannelDTO) => void;
  onChannelDeleted: (channelId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <HugeIcon name={channel.type === ChannelType.VOICE ? 'volume-high' : 'hashtag'} size={18} className="shrink-0 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">{channel.name}</h3>
            <p className="text-xs text-muted-foreground">
              {channel.type === ChannelType.VOICE ? `Limite de ${channel.maxParticipants} participantes` : 'Canal de texto'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ChannelDialog
            channel={channel}
            onSaved={onChannelUpdated}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Editar canal">
                <HugeIcon name="pencil-edit-01" size={16} />
              </Button>
            }
          />
          <DeleteChannelDialog
            channel={channel}
            onDeleted={onChannelDeleted}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Excluir canal">
                <HugeIcon name="delete-02" size={16} className="text-destructive" />
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
