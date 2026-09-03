'use client';

import { useEffect, useState } from 'react';
import type { Participant } from 'livekit-client';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { HugeIcon } from '@/components/HugeIcon';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoice } from '@/providers/VoiceProvider';
import { useParticipantMedia } from '@/hooks/useParticipantMedia';
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator';
import { avatarFromParticipant, isAdminFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';

function ParticipantVolumeControl({ identity }: { identity: string }) {
  const { getParticipantVolume, setParticipantVolume, isParticipantMuted } = useVoice();
  const volume = getParticipantVolume(identity);
  const percent = Math.round(volume * 100);
  const muted = isParticipantMuted(identity);

  return (
    <div className="flex flex-col gap-2 px-2 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Volume</span>
      <div className="relative">
        <Slider
          value={[muted ? 0 : percent]}
          min={0}
          max={150}
          step={1}
          markValue={100}
          snapToMark
          disabled={muted}
          onValueChange={([next]) => setParticipantVolume(identity, next / 100)}
          className={cn(
            '[&_[data-slot=slider-mark]]:border-primary/40',
            muted && 'opacity-50'
          )}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs tabular-nums">
          {muted ? 'Silenciado só para você' : `${percent}%`}
        </span>
      </div>
    </div>
  );
}

/** Sino "tocando": mostrado pra sala inteira enquanto alguém chamou a atenção desse participante (ver callAttention em VoiceProvider). */
function AttentionBell() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 text-amber-500" aria-label="Chamando atenção">
          <HugeIcon name="notification-01" size={18} className="animate-wiggle-loop" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Alguém está chamando a atenção dessa pessoa</TooltipContent>
    </Tooltip>
  );
}

function CallAttentionMenuItem({ identity, onDone }: { identity: string; onDone: () => void }) {
  const { callAttention, getAttentionCooldown } = useVoice();
  const [remainingMs, setRemainingMs] = useState(() => getAttentionCooldown(identity));

  useEffect(() => {
    if (remainingMs <= 0) return;
    const interval = setInterval(() => setRemainingMs(getAttentionCooldown(identity)), 1000);
    return () => clearInterval(interval);
  }, [remainingMs, identity, getAttentionCooldown]);

  const onCooldown = remainingMs > 0;

  const button = (
    <button
      type="button"
      aria-disabled={onCooldown}
      onClick={() => {
        if (onCooldown) return;
        callAttention(identity);
        setRemainingMs(getAttentionCooldown(identity));
        onDone();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
        onCooldown && 'cursor-not-allowed opacity-50 hover:bg-transparent'
      )}
    >
      <HugeIcon name="notification-01" size={16} />
      Chamar atenção
    </button>
  );

  if (!onCooldown) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="left">Aguarde {Math.ceil(remainingMs / 1000)}s pra chamar de novo</TooltipContent>
    </Tooltip>
  );
}

export default function ParticipantTile({ participant }: { participant: Participant }) {
  const isSpeaking = useSpeakingIndicator(participant);
  const { micEnabled, screenSharing, cameraEnabled, deafened } = useParticipantMedia(participant);
  const {
    enterStream,
    disconnectParticipant,
    channel,
    isParticipantMuted,
    toggleParticipantMute,
    isServerMuted,
    toggleServerMute,
    stopCamera,
    isCallingAttention,
  } = useVoice();
  const mutedForMe = !participant.isLocal && isParticipantMuted(participant.identity);
  // Sem o !isLocal aqui de propósito: silenciado para todos é um estado visível
  // pra sala inteira, inclusive pro próprio participante olhando o próprio tile
  // (diferente de mutedForMe, que só existe do ponto de vista de quem ouve).
  const serverMuted = isServerMuted(participant.identity);
  const callingAttention = isCallingAttention(participant.identity);
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = participantDisplayName(participant);
  const router = useRouter();
  const pathname = usePathname();

  /** Clique no "AO VIVO" pode vir de fora da página do canal (ex.: no chat) — leva pra tela de voz antes de entrar na transmissão. */
  const watchStream = (identity: string) => {
    if (channel && pathname !== routeNames.CHANNEL(channel.id)) router.push(routeNames.CHANNEL(channel.id));
    enterStream(identity);
  };

  const isChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);
  const isFullAdmin = Boolean(session?.user?.isAdmin);
  const targetIsAdmin = isAdminFromParticipant(participant);
  const canModerate = isChannelsAdmin && !participant.isLocal;
  // Channels_admin sem ser ADMIN completo não pode desconectar (nem mutar
  // para todos) um ADMIN — mesma regra de /api/rtc/kick.
  const canManageTarget = canModerate && (!targetIsAdmin || isFullAdmin);
  const canCallAttention = !participant.isLocal && deafened;
  const showMenu = !participant.isLocal;

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverAnchor asChild>
        <li
          className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50', showMenu && 'cursor-pointer')}
          onClick={() => {
            if (!showMenu) return;
            setMenuOpen(true);
          }}
          onContextMenu={(event) => {
            if (!canModerate) return;
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          <div className="relative shrink-0">
            {isSpeaking && (
              <span className="absolute -inset-1.5 animate-pulse rounded-full bg-green-500/40 blur-sm" aria-hidden />
            )}
            <Avatar
              image={avatarFromParticipant(participant)}
              fallback={name.slice(0, 2)}
              size={8}
              className={cn('ring-2 ring-transparent transition-colors', isSpeaking && 'ring-green-500')}
            />
          </div>

          <span className="flex-1 truncate text-sm font-medium">{name}</span>

          {callingAttention && <AttentionBell />}

          {screenSharing &&
            (participant.isLocal ? (
              <Badge variant="destructive" className="shrink-0 text-[10px]">
                AO VIVO
              </Badge>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="destructive"
                    role="button"
                    tabIndex={0}
                    className="shrink-0 cursor-pointer text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      watchStream(participant.identity);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        watchStream(participant.identity);
                      }
                    }}
                  >
                    AO VIVO
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Clique para assistir a transmissão</TooltipContent>
              </Tooltip>
            ))}
          {cameraEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-white" aria-label="Câmera ligada">
                  <HugeIcon name="camera-01" size={18} />
                </span>
              </TooltipTrigger>
              <TooltipContent>Câmera ligada</TooltipContent>
            </Tooltip>
          )}
          {serverMuted ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-destructive" aria-label="Silenciado para todos">
                  <HugeIcon name="mic-off-02" size={18} />
                </span>
              </TooltipTrigger>
              <TooltipContent>Silenciado para todos</TooltipContent>
            </Tooltip>
          ) : mutedForMe ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-muted-foreground" aria-label="Silenciado por você">
                  <HugeIcon name="mic-off-02" size={18} />
                </span>
              </TooltipTrigger>
              <TooltipContent>Silenciado por você</TooltipContent>
            </Tooltip>
          ) : (
            !micEnabled && (
              <HugeIcon name="mic-off-02" size={18} aria-label="Microfone desligado" className="shrink-0 text-muted-foreground" />
            )
          )}
          {deafened && <HugeIcon name="headphone-mute" size={18} aria-label="Ensurdecido" className="shrink-0 text-muted-foreground" />}
        </li>
      </PopoverAnchor>

      {showMenu && (
        <PopoverContent align="start" className="w-56 border-0 p-1">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar image={avatarFromParticipant(participant)} fallback={name.slice(0, 2)} size={8} />
            <span className="truncate text-sm font-medium">{name}</span>
          </div>

          <ParticipantVolumeControl identity={participant.identity} />

          <Separator className="my-1" />

          <div className='flex flex-col gap-1'>
            {screenSharing && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  watchStream(participant.identity);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
              >
                <HugeIcon name="view" size={16} />
                Assistir transmissão
              </button>
            )}

            {canCallAttention && <CallAttentionMenuItem identity={participant.identity} onDone={() => setMenuOpen(false)} />}

            <button
              type="button"
              onClick={() => {
                toggleParticipantMute(participant.identity);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <HugeIcon name={mutedForMe ? 'mic-02' : 'mic-off-02'} size={16} />
              {mutedForMe ? 'Reativar para você' : 'Silenciar para você'}
            </button>

            {canManageTarget && (
              <button
                type="button"
                onClick={() => {
                  void toggleServerMute(participant.identity);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <HugeIcon name={serverMuted ? 'mic-02' : 'mic-off-02'} size={16} />
                {serverMuted ? 'Reativar microfone para todos' : 'Silenciar para todos'}
              </button>
            )}

            {canManageTarget && cameraEnabled && (
              <button
                type="button"
                onClick={() => {
                  void stopCamera(participant.identity);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <HugeIcon name="camera-off-01" size={16} />
                Desligar câmera
              </button>
            )}

            {canManageTarget && (
              <button
                type="button"
                onClick={() => {
                  if (!channel) return;
                  setMenuOpen(false);
                  disconnectParticipant(channel.id, participant.identity);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <HugeIcon name="logout-01" size={16} />
                Desconectar
              </button>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
