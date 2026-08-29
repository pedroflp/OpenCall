'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, Room } from 'livekit-client';
import { Track } from 'livekit-client';
import { useTracks, VideoTrack } from '@livekit/components-react';
import { animate, motion, useMotionValue } from 'motion/react';
import Avatar from '@/components/Avatar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import { cn } from '@/lib/utils';

// 70% da largura da tela, na mesma proporção 16:9 usada em todo o resto do
// app pra vídeo de câmera (aspect-video, ver CameraGrid/VoiceChannelStage).
const BUBBLE_WIDTH_RATIO = 0.7;
const CAMERA_ASPECT_RATIO = 16 / 9;
const EDGE_MARGIN = 12;
// Abaixo do z-[999] do CallScreenDim de propósito: se a tela apagar por
// inatividade (ver useCallWakeLockDim), o dim cobre a bolha também.
const BUBBLE_Z_INDEX = 900;

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Size = { width: number; height: number };

function bubbleSize(viewportWidth: number): Size {
  const width = viewportWidth * BUBBLE_WIDTH_RATIO;
  return { width, height: width / CAMERA_ASPECT_RATIO };
}

function cornerPosition(corner: Corner, viewportWidth: number, viewportHeight: number, size: Size) {
  return {
    x: corner === 'tl' || corner === 'bl' ? EDGE_MARGIN : viewportWidth - size.width - EDGE_MARGIN,
    y: corner === 'tl' || corner === 'tr' ? EDGE_MARGIN : viewportHeight - size.height - EDGE_MARGIN,
  };
}

function nearestCorner(x: number, y: number, viewportWidth: number, viewportHeight: number, size: Size): Corner {
  const left = x + size.width / 2 < viewportWidth / 2;
  const top = y + size.height / 2 < viewportHeight / 2;
  return top ? (left ? 'tl' : 'tr') : left ? 'bl' : 'br';
}

// useSpeakingIndicator não pode ser chamado num loop com tamanho variável
// (regra dos hooks muda a cada câmera ligada/desligada) — cada candidato a
// ocupar a bolha vira um componente próprio que só reporta a mudança pro pai.
function SpeakingWatcher({
  participant,
  onChange,
}: {
  participant: Participant;
  onChange: (identity: string, speaking: boolean) => void;
}) {
  const speaking = useSpeakingIndicator(participant);

  useEffect(() => {
    onChange(participant.identity, speaking);
    return () => onChange(participant.identity, false);
  }, [participant, speaking, onChange]);

  return null;
}

/**
 * Bolha flutuante e arrastável (some nas quatro pontas da tela) com a câmera
 * de quem, entre os participantes com câmera ligada, estiver falando agora —
 * some por completo quando ninguém mais tem câmera ligada. Substitui o
 * carrossel de câmeras no mobile (ver docs/rfc-camera.md D6).
 *
 * `room` passado explicitamente (não só via contexto) e o componente inteiro
 * só monta quando ele existe — mesma razão do CallScreenDim: os hooks de
 * track do LiveKit (useTracks, useSpeakingIndicator) explodem com "No room
 * provided" se chamados antes da conexão terminar de propagar pro RoomContext.
 */
export default function FloatingCameraBubble({ active, room }: { active: boolean; room: Room | null }) {
  if (!room) return null;
  return <FloatingCameraBubbleInner active={active} room={room} />;
}

function FloatingCameraBubbleInner({ active, room }: { active: boolean; room: Room }) {
  const isMobile = useIsMobile();
  const cameraTracks = useTracks([Track.Source.Camera], { room }).filter((trackRef) => !trackRef.publication.isMuted);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [activeIdentity, setActiveIdentity] = useState<string | null>(null);

  const handleSpeakingChange = useCallback((identity: string, speaking: boolean) => {
    setSpeakingMap((prev) => (prev[identity] === speaking ? prev : { ...prev, [identity]: speaking }));
  }, []);

  useEffect(() => {
    const speaker = cameraTracks.find((trackRef) => speakingMap[trackRef.participant.identity]);
    setActiveIdentity((prev) => {
      if (speaker) return speaker.participant.identity;
      if (prev && cameraTracks.some((trackRef) => trackRef.participant.identity === prev)) return prev;
      return cameraTracks[0]?.participant.identity ?? null;
    });
  }, [cameraTracks, speakingMap]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [size, setSize] = useState<Size>(() => bubbleSize(window.innerWidth));
  const cornerRef = useRef<Corner>('br');
  const positionedRef = useRef(false);

  useEffect(() => {
    if (positionedRef.current) return;
    positionedRef.current = true;
    const start = cornerPosition('br', window.innerWidth, window.innerHeight, size);
    x.set(start.x);
    y.set(start.y);
  }, [x, y, size]);

  useEffect(() => {
    const onResize = () => {
      const nextSize = bubbleSize(window.innerWidth);
      setSize(nextSize);
      const next = cornerPosition(cornerRef.current, window.innerWidth, window.innerHeight, nextSize);
      x.set(next.x);
      y.set(next.y);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [x, y]);

  const activeTrack = cameraTracks.find((trackRef) => trackRef.participant.identity === activeIdentity);

  if (!active || !isMobile || !activeTrack) return null;

  const handleDragEnd = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const corner = nearestCorner(x.get(), y.get(), viewportWidth, viewportHeight, size);
    cornerRef.current = corner;
    const target = cornerPosition(corner, viewportWidth, viewportHeight, size);
    animate(x, target.x, { type: 'spring', bounce: 0.2, duration: 0.35 });
    animate(y, target.y, { type: 'spring', bounce: 0.2, duration: 0.35 });
  };

  const name = participantDisplayName(activeTrack.participant);

  return (
    <>
      {cameraTracks.map((trackRef) => (
        <SpeakingWatcher
          key={trackRef.participant.identity}
          participant={trackRef.participant}
          onChange={handleSpeakingChange}
        />
      ))}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.12}
        onDragEnd={handleDragEnd}
        style={{ x, y, width: size.width, height: size.height, zIndex: BUBBLE_Z_INDEX }}
        className={cn(
          'fixed left-0 top-0 touch-none overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10'
        )}
      >
        <VideoTrack trackRef={activeTrack} className="size-full object-cover" />
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 py-1 pl-1 pr-2">
          <Avatar image={avatarFromParticipant(activeTrack.participant)} fallback={name.slice(0, 2)} size={6} />
          <span className="truncate text-sm font-semibold text-white">{name}</span>
        </div>
      </motion.div>
    </>
  );
}
