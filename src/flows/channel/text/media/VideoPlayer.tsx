'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { cn } from '@/lib/utils';
import type { AttachmentDTO } from '@/lib/chat/dto';
import MediaScrubber from './MediaScrubber';
import VolumeControl from './VolumeControl';
import { formatDuration } from './format';
import { useMediaElement } from './useMediaElement';

const CONTROLS_HIDE_DELAY_MS = 2_500;
const SKIP_SECONDS = 10;
const ARROW_SECONDS = 5;

function ControlButton({ label, icon, size = 18, onClick }: { label: string; icon: string; size?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:text-white"
    >
      <HugeIcon name={icon} size={size} />
    </button>
  );
}

/**
 * Player de vídeo da mensagem, com UI própria — `controls` nativo fica
 * desligado (ver D6 da RFC de anexos): é o pedido de produto e é o que deixa
 * vídeo e áudio terem formas diferentes em vez de duas barras cinzas do
 * browser.
 *
 * A proporção sai de width/height do DTO, então a caixa já nasce do tamanho
 * final: sem isso a lista pula quando o metadata chega e o vídeo "abre".
 */
export default function VideoPlayer({ attachment }: { attachment: AttachmentDTO }) {
  const t = useTranslations('chat.media');
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const media = useMediaElement(videoRef, attachment.durationMs);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);

  useEffect(() => setPipAvailable(typeof document !== 'undefined' && document.pictureInPictureEnabled), []);

  const revealControls = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    // Só some enquanto toca: parado, a barra é a única pista de que o player
    // tem controle nenhum visível.
    if (videoRef.current && !videoRef.current.paused) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    revealControls();
    return () => clearTimeout(hideTimerRef.current);
  }, [media.playing, revealControls]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void containerRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const togglePip = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement === el) void document.exitPictureInPicture().catch(() => {});
    else void el.requestPictureInPicture().catch(() => {});
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const actions: Record<string, () => void> = {
      ' ': media.toggle,
      k: media.toggle,
      ArrowLeft: () => media.skip(-ARROW_SECONDS),
      ArrowRight: () => media.skip(ARROW_SECONDS),
      j: () => media.skip(-SKIP_SECONDS),
      l: () => media.skip(SKIP_SECONDS),
      m: media.toggleMute,
      f: toggleFullscreen,
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
    revealControls();
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerMove={revealControls}
      onPointerLeave={() => {
        if (media.playing) setControlsVisible(false);
      }}
      className={cn(
        'group/player relative mt-1.5 w-[420px] max-w-full overflow-hidden rounded-[12px] border border-border/50 bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        fullscreen && 'flex h-full w-full items-center justify-center rounded-none border-0',
      )}
      style={fullscreen ? undefined : { aspectRatio: `${attachment.width ?? 16} / ${attachment.height ?? 9}` }}
    >
      <video
        ref={videoRef}
        src={attachment.url}
        preload="metadata"
        playsInline
        onClick={media.toggle}
        onDoubleClick={toggleFullscreen}
        className="h-full w-full cursor-pointer object-contain"
      />

      {/* Capa antes do primeiro play: botão grande no meio e a duração no canto,
          que é o que o poster daria — e não há poster (ver §3 da RFC). */}
      {!media.started && (
        <button
          type="button"
          onClick={media.toggle}
          aria-label={t('playVideo')}
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <HugeIcon name="play" size={26} className="translate-x-px" />
          </span>
          {media.duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {formatDuration(media.duration)}
            </span>
          )}
        </button>
      )}

      {media.waiting && media.started && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <HugeIcon name="loading-03" size={30} className="animate-spin text-white/80" />
        </span>
      )}

      <div
        onPointerMove={(event) => event.stopPropagation()}
        className={cn(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 pb-1.5 pt-6 transition-opacity duration-200',
          controlsVisible || !media.started ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <MediaScrubber
          value={media.currentTime}
          max={media.duration}
          buffered={media.bufferedEnd}
          onChange={media.seek}
          tone="onDark"
          step={ARROW_SECONDS}
          ariaLabel={t('videoPosition')}
          ariaValueText={formatDuration(media.currentTime)}
        />

        <div className="mt-1 flex items-center gap-0.5 text-white">
          <ControlButton label={media.playing ? t('pause') : t('play')} icon={media.playing ? 'pause' : 'play'} onClick={media.toggle} />
          <ControlButton label={t('skipBack')} icon="go-backward-10-sec" onClick={() => media.skip(-SKIP_SECONDS)} />
          <ControlButton label={t('skipForward')} icon="go-forward-10-sec" onClick={() => media.skip(SKIP_SECONDS)} />

          <span className="ml-1.5 select-none text-[11.5px] font-medium tabular-nums text-white/85">
            {formatDuration(media.currentTime)} / {formatDuration(media.duration)}
          </span>

          <div className="flex-1" />

          <VolumeControl
            volume={media.volume}
            muted={media.muted}
            onChange={media.changeVolume}
            onToggleMute={media.toggleMute}
            tone="onDark"
            className="text-white/90"
          />
          {pipAvailable && <ControlButton label={t('pictureInPicture')} icon="picture-in-picture-on" size={17} onClick={togglePip} />}
          <ControlButton
            label={fullscreen ? t('exitFullscreen') : t('fullscreen')}
            icon={fullscreen ? 'arrow-shrink-02' : 'full-screen'}
            size={17}
            onClick={toggleFullscreen}
          />
        </div>
      </div>
    </div>
  );
}
