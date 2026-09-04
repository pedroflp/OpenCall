'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import type { Participant } from 'livekit-client';
import { useSession } from 'next-auth/react';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStreamViewers } from '@/hooks/useStreamViewers';
import { useVoice } from '@/providers/VoiceProvider';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { cn } from '@/lib/utils';

const MAX_VISIBLE_AVATARS = 4;

function ViewerAvatar({ viewer, canModerate }: { viewer: Participant; canModerate: boolean }) {
  const t = useTranslations('voice.participant');
  const { removeSpectator } = useVoice();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = participantDisplayName(viewer);

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <button
              type="button"
              onClick={() => {
                if (!canModerate) return;
                setMenuOpen(true);
              }}
              onContextMenu={(event) => {
                if (!canModerate) return;
                event.preventDefault();
                setMenuOpen(true);
              }}
              className={cn('rounded-full', canModerate && 'cursor-pointer')}
            >
              <Avatar image={avatarFromParticipant(viewer)} fallback={name.slice(0, 2)} size={6} className={cn("ring-2 ring-black/70", { "ring-destructive": menuOpen })} />
            </button>
          </PopoverAnchor>
        </TooltipTrigger>
        <TooltipContent side="bottom">{name}</TooltipContent>
      </Tooltip>

      {canModerate && (
        <PopoverContent align="center" className="w-52 p-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              removeSpectator(viewer.identity);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <HugeIcon name="view-off-slash" size={16} />
            {t('removeFromStream')}
          </button>
        </PopoverContent>
      )}
    </Popover>
  );
}

export default function LiveViewersAvatarGroup({
  streamerIdentity,
  className,
}: {
  streamerIdentity: string;
  className?: string;
}) {
  const viewers = useStreamViewers(streamerIdentity);
  const { data: session } = useSession();
  const canModerate = Boolean(session?.user?.isAdmin);

  if (viewers.length === 0) return null;

  const shown = viewers.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = viewers.length - shown.length;

  return (
    <div className={cn('flex items-center gap-1.5 rounded-full bg-black/55 py-1.5 pl-1.5 pr-2.5', className)}>
      <span className="flex items-center gap-2 text-xs font-semibold text-white">
        <HugeIcon name="view" size={16} />
      </span>
      <div className="flex -space-x-2">
        {shown.map((viewer) => (
          <ViewerAvatar key={viewer.identity} viewer={viewer} canModerate={canModerate} />
        ))}
        {overflow > 0 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-2 ring-black/70">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
