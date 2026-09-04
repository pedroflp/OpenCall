'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Room } from 'livekit-client';
import { RemoteTrackPublication, Track } from 'livekit-client';
import { useTracks, VideoTrack } from '@livekit/components-react';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Badge } from '@/components/ui/badge';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useStageOverlayToggle } from '@/hooks/useStageOverlayToggle';
import { useVoice } from '@/providers/VoiceProvider';
import { cn } from '@/lib/utils';
import { LiveVolumeButton } from './VoiceChannelStage';

// Mesmo par de estado que SelfControlCard/VoiceControls: destructive quando
// "desligado"/"ensurdecido" (o estado que o usuário normalmente quer notar),
// chrome escuro no estado normal — só o formato do botão muda pra combinar com
// o resto do overlay (rounded-lg em vez do ghost/secondary do card da sidebar).
function StreamControlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-11 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' : 'bg-black/55 text-white hover:bg-black/70'
      )}
    >
      {children}
    </button>
  );
}

// Acima do z-[999] do CallScreenDim de propósito: assistir uma transmissão é
// uso ativo da tela, o dim por inatividade (ver useCallWakeLockDim) não deve
// cobrir o vídeo por cima.
const STREAM_VIEW_Z_INDEX = 1000;

// screen.orientation.lock()/unlock() (Screen Orientation API) não está no lib
// "dom" do TS deste projeto, apesar de implementado nos navegadores mobile que
// importam aqui (Chrome/Firefox Android) — iOS Safari nunca suportou, daí o
// try/catch tratando os dois como best-effort.
type OrientationLockScreen = Screen & {
  orientation?: ScreenOrientation & { lock?: (orientation: string) => Promise<void>; unlock?: () => void };
};

/**
 * Palco de transmissão pro mobile — VoiceChannelStage.tsx é `hidden
 * min-[900px]:flex`, então abaixo de 900px `watching` nunca tinha onde
 * renderizar (ver docs/rfc-camera.md §1, achado sobre a ausência de vídeo no
 * mobile). Esse componente cobre esse buraco: overlay fixed cobrindo a tela
 * inteira, exclusivo — enquanto uma transmissão está aberta, é a única coisa
 * renderizada (sidebar, grid de câmera etc. ficam por baixo, inacessíveis).
 * `leaveStream`/`toggleScreenShare` (pro próprio streamer) são o único jeito
 * de voltar a ver o grid de câmeras/participantes.
 *
 * Montado dentro de VoiceProvider, mesmo padrão de CallScreenDim/
 * FloatingCameraBubble: `room` explícito (não só contexto), porque os hooks
 * de track do LiveKit exigem RoomContext já propagado.
 */
export default function MobileStreamView({ active, room }: { active: boolean; room: Room | null }) {
  if (!room) return null;
  return <MobileStreamViewInner active={active} room={room} />;
}

function MobileStreamViewInner({ active, room }: { active: boolean; room: Room }) {
  const t = useTranslations('voice.controls');
  const tParticipant = useTranslations('voice.participant');
  const isMobile = useIsMobile();
  const { watching, leaveStream, toggleScreenShare, micEnabled, deafened, toggleMic, toggleDeafen } = useVoice();
  // onlySubscribed: false — mesma razão do palco desktop: precisa achar a
  // track da live assistida mesmo antes da subscription confirmar.
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { room, onlySubscribed: false });
  const watchedTrack = watching ? screenShareTracks.find((track) => track.participant.identity === watching) : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  // Sempre ligado, ao contrário do palco desktop: aqui não existe o estado
  // "fora da tela cheia" — este overlay JÁ cobre a tela inteira, e é o único
  // renderizado enquanto a transmissão está aberta.
  const overlay = useStageOverlayToggle(true);
  const shouldShow = active && isMobile && Boolean(watchedTrack);

  // Sem simulcast no screen share — setEnabled(false) é o único jeito de
  // cortar os bytes de vídeo quando a aba vai pra segundo plano (mesmo
  // mecanismo do palco desktop, ver VoiceChannelStage.tsx).
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

  // Fullscreen real + trava de orientação em portrait enquanto a transmissão
  // está aberta. requestFullscreen() é pré-requisito na maioria dos
  // navegadores mobile pra orientation.lock funcionar — best-effort dos dois:
  // iOS Safari não suporta nenhuma das duas APIs, e o overlay fixed já cobre
  // a tela inteira visualmente de qualquer forma, então a falha é silenciosa.
  useEffect(() => {
    if (!shouldShow) return;
    const node = containerRef.current;

    const orientation = (screen as OrientationLockScreen).orientation;

    node?.requestFullscreen?.().catch(() => {});
    orientation?.lock?.('portrait').catch(() => {});

    return () => {
      if (document.fullscreenElement === node) document.exitFullscreen().catch(() => {});
      orientation?.unlock?.();
    };
  }, [shouldShow]);

  if (!shouldShow || !watchedTrack) return null;

  const name = participantDisplayName(watchedTrack.participant);
  const isOwnStream = watchedTrack.participant.isLocal;
  const closeLabel = isOwnStream ? t('endStream') : t('leaveStream');

  return (
    <div
      ref={containerRef}
      onClick={overlay.onStageClick}
      className="fixed inset-0 flex flex-col bg-black"
      style={{ zIndex: STREAM_VIEW_Z_INDEX }}
    >
      <VideoTrack trackRef={watchedTrack} className="size-full object-contain" />

      <div
        aria-hidden={!overlay.visible}
        className={cn('absolute left-3 right-3 flex items-center justify-between gap-2', overlay.overlayClassName)}
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/55 py-1.5 pl-1.5 pr-3">
          <Avatar image={avatarFromParticipant(watchedTrack.participant)} fallback={name.slice(0, 2)} size={6} />
          <span className="truncate text-sm font-semibold text-white">{name}</span>
          <Badge variant="destructive" className="shrink-0 text-[10px]">
            {tParticipant('live')}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LiveVolumeButton
            identity={watchedTrack.participant.identity}
            side="bottom"
            container={containerRef.current}
            className="size-9 bg-black/55 text-white hover:bg-black/70"
          />

          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => (isOwnStream ? toggleScreenShare() : leaveStream())}
            className="flex size-9 items-center justify-center rounded-lg bg-destructive/20 text-destructive transition-colors hover:bg-destructive/30"
          >
            <HugeIcon name="view-off-slash" size={18} />
          </button>
        </div>
      </div>

      <div
        aria-hidden={!overlay.visible}
        className={cn('absolute inset-x-0 flex items-center justify-center gap-3', overlay.overlayClassName)}
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <StreamControlButton
          label={micEnabled ? 'Desligar microfone' : 'Ligar microfone'}
          active={!micEnabled}
          onClick={() => toggleMic()}
        >
          <HugeIcon name={micEnabled ? 'mic-02' : 'mic-off-02'} size={20} />
        </StreamControlButton>

        <StreamControlButton
          label={deafened ? 'Voltar a ouvir' : 'Silenciar tudo'}
          active={deafened}
          onClick={() => toggleDeafen()}
        >
          <HugeIcon name={deafened ? 'headphone-mute' : 'headphones'} size={20} />
        </StreamControlButton>
      </div>
    </div>
  );
}
