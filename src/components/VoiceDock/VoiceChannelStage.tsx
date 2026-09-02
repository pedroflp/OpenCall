'use client';

import { useEffect, useRef, useState } from 'react';
import type { Participant } from 'livekit-client';
import { RemoteTrackPublication, Track } from 'livekit-client';
import type { TrackReference } from '@livekit/components-react';
import { useParticipants, useTracks, VideoTrack } from '@livekit/components-react';
import { useSession } from 'next-auth/react';
import type { PresenceParticipant } from '@/lib/rtc/presence';
import type { UserDTO } from '@/app/api/user/types';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoice } from '@/providers/VoiceProvider';
import { useParticipantMedia } from '@/hooks/useParticipantMedia';
import { useStageOverlayToggle } from '@/hooks/useStageOverlayToggle';
import { useParticipantGridLayout } from '@/hooks/useParticipantGridLayout';
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { cn } from '@/lib/utils';
import { ChannelBackground } from './ChannelBackground';
import CameraGrid, { CameraTile } from './CameraGrid';
import LiveViewersAvatarGroup from './LiveViewersAvatarGroup';

// Não muda nada do que chega pela rede — é pós-processamento local no
// <video> do espectador (GPU-composited), tentando disfarçar a resolução de
// origem sem gastar banda/CPU extra do publisher. Ver [[rtc-video-tuning]]:
// a fonte do pixelado é a captura, isso só mascara, não recupera detalhe.
const SPECTATOR_SHARPEN_FILTER = 'contrast(1.06) saturate(1.08) brightness(1.01)';

function StageHeader({
  channelName,
  count,
  onNameClick,
}: {
  channelName: string;
  count: number;
  onNameClick?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-2">
      <HugeIcon name="volume-high" size={19} className="text-muted-foreground" />
      <span className="text-[15px] font-bold">{channelName}</span>
    </div>
  );

  // if (onNameClick) {
  //   return (
  //     <button
  //       type="button"
  //       onClick={onNameClick}
  //       className="flex h-[52px] w-full shrink-0 items-center justify-between bg-background/40 backdrop-blur-sm px-4 text-left hover:bg-muted/30"
  //     >
  //       {content}
  //     </button>
  //   );
  // }

  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border/40 px-4">
      {content}
    </div>
  );
}

// Mesmo slot que CameraTile (ver CameraGrid.tsx) — sem câmera ligada, o
// participante ainda ocupa uma célula do grid central, só que com o avatar
// centralizado no lugar do vídeo. Sem largura/altura própria de propósito
// (size-full): quem dá a forma é o wrapper no grid (ver ConnectedStage),
// senão o tile briga com o tamanho da coluna e invade a vizinha.
function IdleTile({ participant }: { participant: Participant }) {
  const { micEnabled, deafened, screenSharing } = useParticipantMedia(participant);
  const isSpeaking = useSpeakingIndicator(participant);
  const { enterStream } = useVoice();
  const name = participantDisplayName(participant);
  const speaking = isSpeaking && !screenSharing;

  const tile = (
    <button
      type="button"
      disabled={!screenSharing}
      onClick={() => enterStream(participant.identity)}
      className={cn(
        'relative flex size-full border-[1px] flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl bg-gradient-to-tr backdrop-blur-lg from-accent/5 via-transparent to-primary/5 shadow-xl transition-colors',
        screenSharing
          ? 'cursor-pointer border-destructive bg-destructive/5'
          : speaking
            ? 'cursor-default border-green-500'
            : 'cursor-default border-primary/10'
      )}
    >
      <div className="relative z-[3]">
        <Avatar
          image={avatarFromParticipant(participant)}
          fallback={name.slice(0, 2)}
          size={14}
          className={cn('ring-4 ring-offset-4 ring-offset-black transition-colors', screenSharing ? 'ring-destructive' : 'ring-transparent')}
        />
        {(deafened || !micEnabled) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
            <HugeIcon name={deafened ? 'headphone-mute' : 'mic-off-02'} size={18} />
          </div>
        )}
      </div>
      <Avatar
        image={avatarFromParticipant(participant)}
        fallback={name.slice(0, 2)}
        size={64}
        className={cn(
          'absolute z-[2] blur-xl opacity-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
      />
      <span className="truncate text-md font-semibold text-white">{name}</span>
      {screenSharing && (
        <Badge variant="destructive" className="absolute right-3 top-3 whitespace-nowrap text-sm">
          AO VIVO
        </Badge>
      )}
    </button>
  );

  const tileWithTooltip = !screenSharing ? (
    tile
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent>Clique para entrar na transmissão</TooltipContent>
    </Tooltip>
  );

  // Wrapper fora do overflow-hidden do card de propósito (mesmo padrão de
  // TileShell em CameraGrid.tsx): o halo de pulso vaza pra fora das bordas
  // arredondadas do card, o que um inset negativo dentro do próprio card
  // (que tem overflow-hidden pra recortar o vídeo/avatar) cortaria.
  return (
    <div className="relative size-full">
      {speaking && <span className="absolute -inset-1.5 animate-pulse rounded-3xl bg-green-500/40 blur-md" aria-hidden />}
      {tileWithTooltip}
    </div>
  );
}

function FullscreenToggleButton({
  isFullscreen,
  onClick,
  className,
  side = 'top',
}: {
  isFullscreen: boolean;
  onClick: () => void;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          onClick={onClick}
          className={cn('flex items-center justify-center rounded-lg transition-colors', className)}
        >
          <HugeIcon name={isFullscreen ? 'arrow-shrink-02' : 'arrow-expand-01'} size={18} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</TooltipContent>
    </Tooltip>
  );
}

export function LiveVolumeButton({
  identity,
  className,
  side = 'top',
  container,
}: {
  identity: string;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const { getStreamVolume, setStreamVolume } = useVoice();
  const volume = getStreamVolume(identity);
  const percent = Math.round(volume * 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <button
              type="button"
              aria-label="Volume da live"
              onClick={() => setOpen(true)}
              className={cn('flex items-center justify-center rounded-lg transition-colors', className)}
            >
              <HugeIcon name={percent === 0 ? 'volume-off' : 'volume-high'} size={18} />
            </button>
          </PopoverAnchor>
        </TooltipTrigger>
        <TooltipContent side={side}>Volume da live</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-56 p-1" container={container}>
        <div className="flex flex-col gap-2 px-2 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Volume da live</span>
          <div className="relative">
            <Slider
              value={[percent]}
              min={0}
              max={150}
              step={1}
              markValue={100}
              snapToMark
              onValueChange={([next]) => setStreamVolume(identity, next / 100)}
              className="[&_[data-slot=slider-track]]:h-8 [&_[data-slot=slider-thumb]]:hover:cursor-grab [&_[data-slot=slider-thumb]]:rounded-[2px] [&_[data-slot=slider-thumb]]:w-[4px] [&_[data-slot=slider-track]]:rounded-[0.7rem] [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-range]]:bg-primary/10 [&_[data-slot=slider-mark]]:border-primary/40"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs tabular-nums">
              {percent}%
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StreamOptionsButton({
  onStopStream,
  container,
}: {
  onStopStream: () => void;
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <button
              type="button"
              aria-label="Opções da transmissão"
              onClick={() => setOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg bg-black/55 text-white transition-colors hover:bg-black/70"
            >
              <HugeIcon name="more-vertical" size={18} />
            </button>
          </PopoverAnchor>
        </TooltipTrigger>
        <TooltipContent side="bottom">Opções da transmissão</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-52 p-1" container={container}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onStopStream();
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <HugeIcon name="monitor-stop" size={16} />
          Desligar transmissão
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Card de outra live disponível enquanto assiste uma diferente — sem
 * reprodução ativa (sem subscription de vídeo), só o avatar do transmissor.
 * Clicar troca o foco: sai da live atual e entra nessa.
 */
function ThumbnailTile({ trackRef }: { trackRef: TrackReference }) {
  const { enterStream } = useVoice();
  const name = participantDisplayName(trackRef.participant);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => enterStream(trackRef.participant.identity)}
          className="relative flex aspect-[16/10] w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-card transition-colors hover:border-primary/60"
        >
          <Badge variant="destructive" className="absolute right-1.5 top-1.5 text-[9px]">
            AO VIVO
          </Badge>
          <Avatar
            image={avatarFromParticipant(trackRef.participant)}
            fallback={name.slice(0, 2)}
            size={12}
            className="ring-2 ring-destructive ring-offset-2 ring-offset-card"
          />
          <span className="max-w-[100px] truncate text-xs font-semibold text-foreground/85">{name}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Clique para entrar na transmissão</TooltipContent>
    </Tooltip>
  );
}

/**
 * Resolução/fps configurados pelo admin (ver AdminStreamView), não os valores
 * reais entregues pela conexão do espectador — é a config-alvo da sala, igual
 * pra todo mundo nela, não uma medição por participante.
 */
function StreamQualityBadge({ height, frameRate }: { height: number; frameRate: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-xs font-semibold text-white">
      {height}p · {frameRate}fps
    </span>
  );
}

/** Card exibido pro alvo enquanto alguém está chamando sua atenção (ver callAttention em VoiceProvider). Some sozinho quando o som acaba. */
function IncomingAttentionCard({
  incomingAttention,
  channelName,
  onActivateAudio,
}: {
  incomingAttention: { identity: string; name: string; avatar?: string };
  channelName: string;
  onActivateAudio: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <HugeIcon name="notification-01" size={22} className="shrink-0 animate-wiggle-loop text-amber-500" />
      <Avatar image={incomingAttention.avatar} fallback={incomingAttention.name.slice(0, 2)} size={8} />
      <p className="text-sm text-foreground/85">
        <span className="font-semibold">{incomingAttention.name}</span> está chamando sua atenção no canal{' '}
        <span className="font-semibold">{channelName}</span>
      </p>
      <Button type="button" size="sm" variant="ghost" className="shrink-0 gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary" onClick={onActivateAudio}>
        <HugeIcon name="headphones" size={16} />
        Ativar áudio
      </Button>
    </div>
  );
}

/** Câmera promovida ao centro do palco por um clique local (ver CameraGrid) — mesmo tratamento visual da live, sem os controles específicos de transmissão. */
function FocusedCameraTile({ trackRef, onUnfocus }: { trackRef: TrackReference; onUnfocus: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Mesma superfície e mesmo gesto da live: em tela cheia, clicar no vídeo
  // esconde nome e controles. Duas telas que se parecem tanto não podem
  // responder ao mesmo clique de jeitos diferentes.
  const overlay = useStageOverlayToggle(isFullscreen);
  const name = participantDisplayName(trackRef.participant);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement === stageRef.current) {
      document.exitFullscreen().catch(() => { });
    } else {
      stageRef.current.requestFullscreen().catch(() => { });
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <div
        ref={stageRef}
        onClick={overlay.onStageClick}
        className={cn(
          'relative overflow-hidden bg-black shadow-2xl',
          isFullscreen ? 'size-full' : 'aspect-video w-full rounded-xl'
        )}
      >
        <VideoTrack
          trackRef={trackRef}
          className={cn('size-full object-contain', trackRef.participant.isLocal && 'scale-x-[-1]')}
        />

        <div
          aria-hidden={!overlay.visible}
          className={cn('absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-1.5 pr-3', overlay.overlayClassName)}
        >
          <Avatar image={avatarFromParticipant(trackRef.participant)} fallback={name.slice(0, 2)} size={6} />
          <span className="text-sm font-semibold text-white">{name}</span>
        </div>

        <div aria-hidden={!overlay.visible} className={cn('absolute right-3 top-3 z-10 flex items-center gap-2', overlay.overlayClassName)}>
          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onClick={toggleFullscreen}
            className="size-9 bg-black/55 text-white hover:bg-black/70"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Voltar câmera pro topo"
                onClick={onUnfocus}
                className="flex size-9 items-center justify-center rounded-lg bg-black/55 text-white transition-colors hover:bg-black/70"
              >
                <HugeIcon name="cancel-01" size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Voltar câmera pro topo</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function ConnectedStage({
  channelName,
  focusedCameraSid,
  onFocusCamera,
  onUnfocusCamera,
}: {
  channelName: string;
  focusedCameraSid: string | null;
  onFocusCamera: (trackSid: string) => void;
  onUnfocusCamera: () => void;
}) {
  const participants = useParticipants();
  const { watching, leaveStream, toggleScreenShare, stopStream, incomingAttention, toggleAttentionAudio, streamQuality } = useVoice();
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  // onlySubscribed: false — precisa listar lives de outros participantes
  // mesmo sem estar inscrito na track (a entrada é manual, ver enterStream).
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const watchedTrack = watching ? screenShareTracks.find((track) => track.participant.identity === watching) : undefined;
  const cameraTracks = useTracks([Track.Source.Camera]).filter((track) => !track.publication.isMuted);
  const focusedCameraTrack = focusedCameraSid
    ? cameraTracks.find((track) => track.publication.trackSid === focusedCameraSid)
    : undefined;
  // Sem live assistida, a câmera de quem estiver com ela ligada substitui o
  // avatar no grid central (ver CameraGrid: a faixa do topo só existe
  // enquanto alguém está sendo assistido, ver docs/rfc-camera.md).
  const cameraTrackByIdentity = new Map(cameraTracks.map((track) => [track.participant.identity, track]));
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const { columns: gridColumns, tileWidth, tileHeight } = useParticipantGridLayout(participants.length, gridContainerRef);
  const participantRows: Participant[][] = [];
  for (let i = 0; i < participants.length; i += gridColumns) {
    participantRows.push(participants.slice(i, i + gridColumns));
  }
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Só em tela cheia: fora dela a live é um card 16:9 com os controles logo
  // abaixo, e ali esconder não ganha nada.
  const overlay = useStageOverlayToggle(isFullscreen);

  useEffect(() => {
    if (focusedCameraSid && !focusedCameraTrack) onUnfocusCamera();
  }, [focusedCameraSid, focusedCameraTrack, onUnfocusCamera]);

  useEffect(() => {
    if (!watching || watchedTrack) return;
    // `useTracks` reidrata de forma assíncrona ao remontar (ex.: voltando do
    // chat de texto pra esse canal) — sem esse atraso, o primeiro render sem
    // a track ainda populada já derrubava o usuário da transmissão que
    // continuava rolando. Só desiste de verdade se continuar ausente.
    const timeout = setTimeout(() => leaveStream(), 1500);
    return () => clearTimeout(timeout);
  }, [watching, watchedTrack, leaveStream]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!watchedTrack && document.fullscreenElement === stageRef.current) {
      document.exitFullscreen().catch(() => { });
    }
  }, [watchedTrack]);

  // Sem simulcast no screen share (RTC_CONFIG em channels.ts só publica uma
  // camada, ver rtc-video-tuning na memória) — setVideoQuality não teria
  // camada mais baixa pra pedir. setEnabled(false) corta os bytes de vídeo
  // de verdade pro lado desse espectador (pausa a subscription no SFU sem
  // renegociar, ao contrário de setSubscribed), sem tocar no publisher nem
  // nos outros espectadores. adaptiveStream (ligado no VoiceProvider) só
  // reage a IntersectionObserver — aba em segundo plano não muda isso.
  useEffect(() => {
    if (!watchedTrack || watchedTrack.participant.isLocal) return;
    const publication = watchedTrack.publication;
    if (!(publication instanceof RemoteTrackPublication)) return;

    const syncEnabled = () => publication.setEnabled(document.visibilityState === 'visible');
    syncEnabled();

    document.addEventListener('visibilitychange', syncEnabled);
    return () => {
      document.removeEventListener('visibilitychange', syncEnabled);
      publication.setEnabled(true);
    };
  }, [watchedTrack]);

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement === stageRef.current) {
      document.exitFullscreen().catch(() => { });
    } else {
      stageRef.current.requestFullscreen().catch(() => { });
    }
  };

  const otherStreamingTracks = screenShareTracks.filter((track) => track.participant.identity !== watching);
  const isOwnStream = watchedTrack?.participant.isLocal ?? false;
  const closeLabel = isOwnStream ? 'Encerrar transmissão' : 'Sair da transmissão';

  return (
    <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
      <StageHeader channelName={channelName} count={participants.length} />

      {watching && (
        <div className="hidden shrink-0 min-[900px]:block">
          <CameraGrid
            focusedTrackSid={focusedCameraSid}
            onFocusTrack={(trackSid) => (trackSid ? onFocusCamera(trackSid) : onUnfocusCamera())}
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {focusedCameraTrack ? (
          <FocusedCameraTile trackRef={focusedCameraTrack} onUnfocus={onUnfocusCamera} />
        ) : watchedTrack ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
            <div
              ref={stageRef}
              onClick={overlay.onStageClick}
              className={cn(
                'relative overflow-hidden bg-gradient-to-tr from-muted/30 to-primary/5 backdrop-blur-md shadow-3xl',
                isFullscreen ? 'size-full' : 'aspect-video w-full rounded-xl'
              )}
            >
              <VideoTrack
                trackRef={watchedTrack}
                className="size-full object-contain"
                style={{ filter: SPECTATOR_SHARPEN_FILTER }}
              />

              <div
                aria-hidden={!overlay.visible}
                className={cn('absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-1.5 pr-3', overlay.overlayClassName)}
              >
                <Avatar
                  image={avatarFromParticipant(watchedTrack.participant)}
                  fallback={participantDisplayName(watchedTrack.participant).slice(0, 2)}
                  size={6}
                />
                <span className="text-sm font-semibold text-white">{participantDisplayName(watchedTrack.participant)}</span>
                <Badge variant="destructive" className="text-[10px]">
                  AO VIVO
                </Badge>
              </div>

              <div aria-hidden={!overlay.visible} className={cn('absolute right-3 top-3 z-10 flex items-center gap-2', overlay.overlayClassName)}>
                {streamQuality && (
                  <StreamQualityBadge height={streamQuality.screenShareHeight} frameRate={streamQuality.screenShareMaxFramerate} />
                )}
                <LiveViewersAvatarGroup streamerIdentity={watchedTrack.participant.identity} />
                {isAdmin && !isOwnStream && (
                  <StreamOptionsButton
                    onStopStream={() => stopStream(watchedTrack.participant.identity)}
                    container={isFullscreen ? stageRef.current : undefined}
                  />
                )}
                <LiveVolumeButton
                  identity={watchedTrack.participant.identity}
                  className="size-9 bg-black/55 text-white hover:bg-black/70"
                  side="bottom"
                  container={isFullscreen ? stageRef.current : undefined}
                />
                <FullscreenToggleButton
                  isFullscreen={isFullscreen}
                  onClick={toggleFullscreen}
                  className="size-9 bg-black/55 text-white hover:bg-black/70"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={closeLabel}
                    onClick={() => (isOwnStream ? toggleScreenShare() : leaveStream())}
                    className="flex size-10 items-center justify-center rounded-lg bg-destructive/20 text-destructive transition-colors hover:bg-destructive/30"
                  >
                    <HugeIcon name="view-off-slash" size={20} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{closeLabel}</TooltipContent>
              </Tooltip>

              <LiveVolumeButton
                identity={watchedTrack.participant.identity}
                className="size-10 bg-secondary/40 text-secondary-foreground hover:bg-secondary/60"
                side="bottom"
              />

              <FullscreenToggleButton
                isFullscreen={isFullscreen}
                onClick={toggleFullscreen}
                side="bottom"
                className="size-10 bg-secondary/40 text-secondary-foreground hover:bg-secondary/60"
              />
            </div>

            {otherStreamingTracks.length > 0 && (
              <div className="flex gap-2.5">
                {otherStreamingTracks.map((track) => (
                  <ThumbnailTile key={track.publication.trackSid} trackRef={track} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col items-center gap-9 p-10">
            {/* Colunas fixas por contagem (matriz — ver useParticipantGridLayout), não
                auto-fit por largura: até 3 participantes numa linha só, 4+ sempre em 2
                colunas (4 vira 2+2, nunca 3+1; a última linha incompleta centraliza
                sozinha, ex.: 5 vira 2+2+1). O tamanho do tile some do espaço realmente
                disponível — largura E altura — então com pouca altura de tela o card
                encolhe mantendo 16:9 em vez de manter o tamanho e cortar nas pontas. */}
            <div ref={gridContainerRef} className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4">
              {participantRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex items-center justify-center gap-4">
                  {row.map((participant) => {
                    const cameraTrack = cameraTrackByIdentity.get(participant.identity);
                    return (
                      <div key={participant.identity} className="shrink-0" style={{ width: tileWidth, height: tileHeight }}>
                        {cameraTrack ? (
                          <CameraTile
                            trackRef={cameraTrack}
                            onFocus={() => onFocusCamera(cameraTrack.publication.trackSid)}
                          />
                        ) : (
                          <IdleTile participant={participant} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {incomingAttention && (
              <IncomingAttentionCard
                incomingAttention={incomingAttention}
                channelName={channelName}
                onActivateAudio={toggleAttentionAudio}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Otimista: o próprio usuário ainda não está no LiveKit, só entrando. Opacidade baixa + shimmer no card inteiro. */
function OptimisticSelfTile({ user }: { user: UserDTO | null }) {
  const name = user?.username || 'Você';

  return (
    <div className="relative flex w-[110px] flex-col items-center gap-2.5 opacity-50">
      <Avatar
        image={user?.avatar}
        fallback={name.slice(0, 2)}
        size={20}
        className="ring-4 ring-transparent ring-offset-4 ring-offset-background"
      />
      <span className="truncate text-sm font-semibold text-foreground/85">{name}</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg bg-[linear-gradient(110deg,transparent_35%,hsl(var(--foreground)/0.35)_50%,transparent_65%)] bg-[length:200%_100%] animate-shine"
      />
    </div>
  );
}

function RtcDisabledBanner() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <HugeIcon name="mic-off-02" size={64} className="text-muted-foreground" />
      <div className="flex flex-col gap-1.5">
        <p className="text-xl font-bold">Os canais estão temporariamente desligados</p>
        <p className="text-sm text-muted-foreground">Ninguém consegue entrar em voz agora. Religue no switch do OpenCall na barra lateral.</p>
      </div>
    </div>
  );
}

function PreJoinStage({
  channelName,
  user,
  presenceParticipants,
  onJoin,
  onWatchParticipant,
  joining,
  rtcEnabled,
}: {
  channelName: string;
  user: UserDTO | null;
  presenceParticipants: PresenceParticipant[];
  onJoin: () => void;
  onWatchParticipant: (identity: string) => void;
  joining: boolean;
  rtcEnabled: boolean;
}) {
  return (
    <div className="relative z-10 flex min-w-0 flex-1 flex-col">
      <StageHeader
        channelName={channelName}
        count={presenceParticipants.length}
        onNameClick={joining || !rtcEnabled ? undefined : onJoin}
      />

      {!rtcEnabled ? (
        <RtcDisabledBanner />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-9 p-10">
          {(presenceParticipants.length > 0 || joining) && (
            <div className="flex flex-wrap justify-center gap-7">
              {presenceParticipants.map((participant) => (
                <div
                  key={participant.identity}
                  className={cn('flex w-[110px] flex-col items-center gap-2.5', participant.identity === user?.id && 'opacity-50')}
                >
                  <div className="relative">
                    <Avatar
                      image={participant.avatar}
                      fallback={participant.name.slice(0, 2)}
                      size={20}
                      className={cn('ring-4 ring-offset-4 ring-offset-background', participant.isStreaming ? 'ring-destructive' : 'ring-transparent')}
                    />
                    {(participant.deafened || participant.micMuted) && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
                        <HugeIcon
                          name={participant.deafened ? 'headphone-mute' : 'mic-off-02'}
                          size={22}
                          aria-label={participant.deafened ? 'Ensurdecido' : 'Microfone desligado'}
                        />
                      </div>
                    )}
                    {participant.isStreaming && (
                      <Badge
                        role="button"
                        tabIndex={0}
                        variant="destructive"
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 cursor-pointer whitespace-nowrap text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onWatchParticipant(participant.identity);
                        }}
                      >
                        AO VIVO
                      </Badge>
                    )}
                  </div>
                  <span className="truncate text-sm font-semibold text-foreground/85">{participant.name}</span>
                </div>
              ))}
              {joining && <OptimisticSelfTile user={user} />}
            </div>
          )}

          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-2xl text-foreground/30">
              {presenceParticipants.length > 0
                ? 'Entre no canal para ouvir e participar da conversa.'
                : 'Ninguém está neste canal ainda. Seja o primeiro a entrar.'}
            </p>
            <Button type="button" size="lg" className="text-xl gap-2 bg-primary/20 py-6 px-8 text-primary hover:bg-primary/30 backdrop-blur-sm" onClick={onJoin} disabled={joining}>
              {joining ? <HugeIcon name="loading-03" size={24} className="animate-spin" /> : <HugeIcon name="login-01" size={24} />}
              {joining ? 'Conectando…' : 'Entrar no canal'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VoiceChannelStage({
  channelName,
  user,
  connected,
  presenceParticipants,
  onJoin,
  onWatchParticipant,
  joining,
  rtcEnabled,
  focusedCameraSid,
  onFocusCamera,
  onUnfocusCamera,
}: {
  channelName: string;
  user: UserDTO | null;
  connected: boolean;
  presenceParticipants: PresenceParticipant[];
  onJoin: () => void;
  onWatchParticipant: (identity: string) => void;
  joining: boolean;
  rtcEnabled: boolean;
  focusedCameraSid: string | null;
  onFocusCamera: (trackSid: string) => void;
  onUnfocusCamera: () => void;
}) {
  return (
    <div className="relative hidden min-h-0 min-w-0 flex-1 bg-background min-[900px]:flex">
      <ChannelBackground />
      {connected ? (
        <ConnectedStage
          channelName={channelName}
          focusedCameraSid={focusedCameraSid}
          onFocusCamera={onFocusCamera}
          onUnfocusCamera={onUnfocusCamera}
        />
      ) : (
        <PreJoinStage
          channelName={channelName}
          user={user}
          presenceParticipants={presenceParticipants}
          onJoin={onJoin}
          onWatchParticipant={onWatchParticipant}
          joining={joining}
          rtcEnabled={rtcEnabled}
        />
      )}
    </div>
  );
}
