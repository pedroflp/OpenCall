'use client';

import type { Participant, Room } from 'livekit-client';
import { useParticipants } from '@livekit/components-react';
import { useTranslations } from 'next-intl';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { useCallWakeLockDim } from '@/hooks/useCallWakeLockDim';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useParticipantMedia } from '@/hooks/useParticipantMedia';
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { cn } from '@/lib/utils';

export default function CallScreenDim({
  active,
  room,
  dimAllowed,
}: {
  active: boolean;
  room: Room | null;
  // Câmera ligada ou a própria transmissão de tela em andamento (docs/rfc-camera.md
  // D9): quem está usando vídeo ativamente não quer a tela escurecendo por cima —
  // o wake lock (useCallWakeLockDim(active)) continua adquirido normalmente, só o
  // overlay visual de escurecimento fica condicionado a esse flag por cima.
  dimAllowed: boolean;
}) {
  const t = useTranslations('call');
  const isMobile = useIsMobile();
  const dimmed = useCallWakeLockDim(active && isMobile);

  if (!dimmed || !dimAllowed) return null;

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-9 bg-black/95 p-10" aria-hidden>
      {room && <DimParticipants room={room} />}
      <div className="flex items-center gap-2 text-white/60">
        <span className="size-2 animate-pulse rounded-full bg-green-500" />
        <b className="text-lg">{t('powerSaving')}</b>
      </div>
      <p className='text-center text-muted-foreground'>{t('powerSavingHint')}</p>
    </div>
  );
}

// room passado explicitamente (não via contexto) — esse componente só monta
// quando `room` existe, mas o gate de dimmed/active roda antes da conexão
// terminar de propagar pro VoiceProvider, então não dá pra confiar só no
// RoomContext aqui.
function DimParticipants({ room }: { room: Room }) {
  const participants = useParticipants({ room });

  return (
    <div className="flex flex-wrap justify-center gap-6">
      {participants.map((participant) => (
        <DimParticipantTile key={participant.identity} participant={participant} />
      ))}
    </div>
  );
}

function DimParticipantTile({ participant }: { participant: Participant }) {
  const { micEnabled, deafened } = useParticipantMedia(participant);
  const isSpeaking = useSpeakingIndicator(participant);
  const name = participantDisplayName(participant);

  return (
    <div className="flex w-[86px] flex-col items-center gap-2">
      <div className="relative">
        {isSpeaking && <span className="absolute -inset-1.5 animate-pulse rounded-full bg-green-500/40 blur-sm" aria-hidden />}
        <Avatar
          image={avatarFromParticipant(participant)}
          fallback={name.slice(0, 2)}
          size={16}
          className={cn('ring-2 ring-offset-2 ring-offset-black transition-colors', isSpeaking ? 'ring-green-500' : 'ring-transparent')}
        />
        {(deafened || !micEnabled) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
            <HugeIcon name={deafened ? 'headphone-mute' : 'mic-off-02'} size={16} />
          </div>
        )}
      </div>
      <span className="truncate text-xs font-semibold text-white/70">{name}</span>
    </div>
  );
}
