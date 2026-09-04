'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useVoice } from '@/providers/VoiceProvider';
import { useSelfIdentity } from '@/hooks/useSelfIdentity';
import type { PresenceParticipant } from '@/lib/rtc/presence';
import type { UserDTO } from '@/app/api/user/types';
import { cn } from '@/lib/utils';

function PreviewParticipantRow({
  participant,
  channelId,
  isChannelsAdmin,
  isFullAdmin,
  isSelf,
}: {
  participant: PresenceParticipant;
  channelId: string;
  isChannelsAdmin: boolean;
  isFullAdmin: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations('voice.participant');
  const { disconnectParticipant, join } = useVoice();
  const [menuOpen, setMenuOpen] = useState(false);
  // Um channels_admin (sem ser ADMIN completo) não pode desconectar um ADMIN — mesma regra de /api/rtc/kick.
  const canDisconnect = isChannelsAdmin && (!participant.isAdmin || isFullAdmin);

  const row = (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5',
        canDisconnect && 'cursor-pointer hover:bg-secondary/50',
        isSelf && 'opacity-50'
      )}
      onClick={() => {
        if (!canDisconnect) return;
        setMenuOpen(true);
      }}
    >
      <Avatar image={participant.avatar} fallback={participant.name.slice(0, 2)} size={8} />
      <span className="flex-1 truncate text-sm font-medium">{participant.name}</span>

      {participant.isStreaming && (
        <Badge
          role="button"
          tabIndex={0}
          variant="destructive"
          className="shrink-0 cursor-pointer text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            void join(channelId, participant.identity);
          }}
        >
          {t('live')}
        </Badge>
      )}
      {participant.cameraEnabled && (
        <HugeIcon name="camera-01" size={18} aria-label={t('cameraOn')} className="shrink-0 text-white" />
      )}
      {participant.micMuted && (
        <HugeIcon name="mic-off-02" size={18} aria-label={t('micOff')} className="shrink-0 text-muted-foreground" />
      )}
      {participant.deafened && (
        <HugeIcon name="headphone-mute" size={18} aria-label={t('deafened')} className="shrink-0 text-muted-foreground" />
      )}
    </li>
  );

  if (!canDisconnect) return row;

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverAnchor asChild>{row}</PopoverAnchor>
      <PopoverContent align="start" className="w-56 border-0 p-1">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar image={participant.avatar} fallback={participant.name.slice(0, 2)} size={8} />
          <span className="truncate text-sm font-medium">{participant.name}</span>
        </div>

        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            disconnectParticipant(channelId, participant.identity);
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <HugeIcon name="logout-01" size={16} />
          {t('disconnect')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default function PreviewParticipantsList({
  channelId,
  participants,
  className,
  joining,
  user,
  isChannelsAdmin,
  isFullAdmin,
}: {
  channelId: string;
  participants: PresenceParticipant[];
  className?: string;
  joining?: boolean;
  user?: UserDTO | null;
  isChannelsAdmin?: boolean;
  isFullAdmin?: boolean;
}) {
  const tCommon = useTranslations('common');
  // Mesma máscara do card otimista do palco (ver OptimisticSelfTile): a linha
  // "entrando" da sidebar e o card do centro são a mesma pessoa no mesmo
  // instante, e não podem discordar sobre que nome e foto ela usa.
  const identity = useSelfIdentity(user ?? null);
  const selfName = identity?.username || tCommon('you');

  return (
    <ul className={className}>
      {participants.map((participant) => (
        <PreviewParticipantRow
          key={participant.identity}
          participant={participant}
          channelId={channelId}
          isChannelsAdmin={Boolean(isChannelsAdmin)}
          isFullAdmin={Boolean(isFullAdmin)}
          isSelf={participant.identity === user?.id}
        />
      ))}

      {/* Otimista: o próprio usuário ainda não está no LiveKit, só entrando. Mesmo tratamento de opacidade + shine da versão no palco. */}
      {joining && (
        <li className="relative flex items-center gap-2 rounded-md px-2 py-1.5 opacity-50">
          <Avatar image={identity?.avatar} fallback={selfName.slice(0, 2)} size={8} className="shrink-0" />
          <span className="flex-1 truncate text-sm font-medium">{selfName}</span>
          <span
            aria-hidden
            className="absolute inset-0 rounded-md bg-[linear-gradient(110deg,transparent_35%,hsl(var(--foreground)/0.35)_50%,transparent_65%)] bg-[length:200%_100%] animate-shine"
          />
        </li>
      )}
    </ul>
  );
}
