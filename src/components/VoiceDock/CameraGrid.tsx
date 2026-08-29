'use client';

import { useEffect } from 'react';
import { RemoteTrackPublication, Track } from 'livekit-client';
import { useTracks, VideoTrack } from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator';
import { useVoice } from '@/providers/VoiceProvider';
import { cn } from '@/lib/utils';

// Mesmo mecanismo já usado no screen share (VoiceChannelStage.tsx) — sem
// simulcast, setEnabled(false) é o único jeito de cortar os bytes de vídeo
// desse tile quando a aba do espectador vai pra segundo plano. Generalizado
// aqui pra cada tile do grid, não só a track "assistida" (ver docs/rfc-camera.md D7).
function useVisibilityPause(trackRef: TrackReference) {
  useEffect(() => {
    if (trackRef.participant.isLocal) return;
    const publication = trackRef.publication;
    if (!(publication instanceof RemoteTrackPublication)) return;

    const syncEnabled = () => publication.setEnabled(document.visibilityState === 'visible');
    syncEnabled();

    document.addEventListener('visibilitychange', syncEnabled);
    return () => {
      document.removeEventListener('visibilitychange', syncEnabled);
      publication.setEnabled(true);
    };
  }, [trackRef]);
}

// Sem largura/altura própria de propósito: um min-width fixo aqui brigava com
// o tamanho de coluna do grid de quem monta (a faixa do topo usa colunas de
// ~220px, o grid central usa ~300-420px) — cada item ficava maior que a
// própria célula e invadia a coluna vizinha. Quem chama é responsável por
// dar a forma (aspect-video + min-height) no wrapper; isso aqui só preenche.
function TileShell({
  trackRef,
  name,
  mirror,
  badge,
  onFocus,
  speaking,
}: {
  trackRef: TrackReference;
  name: string;
  mirror?: boolean;
  badge?: React.ReactNode;
  onFocus?: () => void;
  speaking?: boolean;
}) {
  return (
    <div className="relative size-full">
      {/* Fora do overflow-hidden do card de propósito: um blur com inset negativo
          dentro dele seria cortado nas bordas, perdendo o efeito de halo vazando
          pra fora (mesmo problema que motivou o wrapper extra aqui). */}
      {speaking && <span className="absolute -inset-1.5 animate-pulse rounded-3xl bg-green-500/40 blur-md" aria-hidden />}
      <div
        role={onFocus ? 'button' : undefined}
        tabIndex={onFocus ? 0 : undefined}
        onClick={onFocus}
        onKeyDown={
          onFocus
            ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onFocus();
            }
            : undefined
        }
        className={cn(
          'relative size-full overflow-hidden rounded-3xl bg-gradient-to-tr from-muted/30 to-primary/20 shadow-lg ring-2 transition-colors',
          speaking ? 'ring-green-500' : 'ring-transparent',
          onFocus && 'cursor-pointer'
        )}
      >
        <VideoTrack trackRef={trackRef} className={cn('size-full object-cover')} />
        {badge}
        <div className="absolute bottom-2 z-3 left-2 flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-2.5">
          <Avatar image={avatarFromParticipant(trackRef.participant)} fallback={name.slice(0, 2)} size={5} />
          <span className="text-xs font-semibold text-white">{name}</span>
        </div>
      </div>
    </div>
  );
}

/** Também usado fora da faixa do topo — no grid central de participantes, quando ninguém está assistindo uma live (ver ConnectedStage). */
export function CameraTile({ trackRef, onFocus }: { trackRef: TrackReference; onFocus?: () => void }) {
  useVisibilityPause(trackRef);
  const speaking = useSpeakingIndicator(trackRef.participant);
  const name = participantDisplayName(trackRef.participant);

  return <TileShell trackRef={trackRef} name={name} mirror={trackRef.participant.isLocal} onFocus={onFocus} speaking={speaking} />;
}

// Câmera focada no centro do palco (ver ConnectedStage) empurra a live
// assistida pra essa mesma faixa do topo — um clique nela devolve o centro
// pra live (docs/rfc-camera.md). Sem pausa por visibilidade: a live já tem a
// própria (ConnectedStage), aqui é só um espelho pequeno pra trocar o foco.
function LiveTile({ trackRef, onFocus }: { trackRef: TrackReference; onFocus: () => void }) {
  const name = participantDisplayName(trackRef.participant);

  return (
    <TileShell
      trackRef={trackRef}
      name={name}
      onFocus={onFocus}
      badge={
        <Badge variant="destructive" className="absolute right-2 top-2 text-[10px]">
          AO VIVO
        </Badge>
      }
    />
  );
}

/**
 * Faixa de câmeras ligadas no canal. Carrossel de scroll horizontal abaixo de
 * 900px (ConnectedChannelRow), sempre visível ali — os dois layouts reusam o
 * mesmo tile e a mesma pausa por visibilidade (ver docs/rfc-camera.md D4/D5/D6).
 *
 * No palco desktop (ConnectedStage, dentro de VoiceChannelStage) só é montada
 * enquanto o usuário está assistindo uma live, logo abaixo do StageHeader —
 * sem live assistida, as câmeras aparecem direto no grid
 * central de participantes (ConnectedStage) no lugar do avatar de quem está
 * com a câmera ligada — só quando uma transmissão vira o centro do palco é
 * que elas sobem pra essa faixa do topo.
 *
 * `focusedTrackSid`/`onFocusTrack` só existem nesse uso do palco desktop —
 * sem eles os tiles não viram clicáveis, é o caso do carrossel mobile, que
 * não tem "centro" pra focar nada. Focar uma câmera é local a quem clicou,
 * nunca sincronizado por sala: cada espectador decide por conta própria o que
 * fica no seu próprio centro (ver docs/rfc-camera.md).
 */
export default function CameraGrid({
  focusedTrackSid = null,
  onFocusTrack,
}: {
  focusedTrackSid?: string | null;
  onFocusTrack?: (trackSid: string | null) => void;
} = {}) {
  // setCameraEnabled(false) só muta a track (unpublish é exclusivo do screen
  // share), então a publication continua na lista — sem esse filtro o tile
  // fica preso mostrando o último frame (preto) depois que a câmera desliga.
  const cameraTracks = useTracks([Track.Source.Camera]).filter((trackRef) => !trackRef.publication.isMuted);
  const isMobile = useIsMobile();
  const { watching } = useVoice();
  // onlySubscribed: false — mesma razão do ConnectedStage: precisa achar a
  // track da live assistida mesmo sem já estar inscrito nela.
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  const visibleCameraTracks = focusedTrackSid
    ? cameraTracks.filter((trackRef) => trackRef.publication.trackSid !== focusedTrackSid)
    : cameraTracks;

  const demotedLiveTrack =
    onFocusTrack && focusedTrackSid && watching
      ? screenShareTracks.find((trackRef) => trackRef.participant.identity === watching)
      : undefined;

  if (visibleCameraTracks.length === 0 && !demotedLiveTrack) return null;

  // auto-fill + minmax, não uma coluna fixa: com uma largura crua (220px) um
  // item que não coubesse invadiria a coluna vizinha (mesma causa do bug de
  // sobreposição corrigido no grid central, ver ConnectedStage). O wrapper de
  // cada tile é quem fecha a forma (aspect-video + min-height), TileShell só
  // preenche o que ele der.
  const tileWrapperClassName = cn(
    'aspect-video min-h-[120px]',
    isMobile ? 'w-[70vw] shrink-0 snap-center' : 'shrink-0'
  );

  return (
    <div
      className={cn(
        'relative z-10 w-full shrink-0 gap-2.5 p-3',
        isMobile ? 'flex snap-x snap-mandatory overflow-x-auto' : 'grid grid-cols-[repeat(auto-fill,minmax(200px,220px))]'
      )}
    >
      {demotedLiveTrack && (
        <div key={demotedLiveTrack.publication.trackSid} className={tileWrapperClassName}>
          <LiveTile trackRef={demotedLiveTrack} onFocus={() => onFocusTrack?.(null)} />
        </div>
      )}
      {visibleCameraTracks.map((trackRef) => (
        <div key={trackRef.publication.trackSid} className={tileWrapperClassName}>
          <CameraTile
            trackRef={trackRef}
            onFocus={onFocusTrack ? () => onFocusTrack(trackRef.publication.trackSid) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
