'use client';

import { useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { formatBytes } from '@/lib/chat/attachments';
import type { AttachmentDTO } from '@/lib/chat/dto';
import MediaScrubber from './MediaScrubber';
import VolumeControl from './VolumeControl';
import { formatDuration } from './format';
import { useMediaElement } from './useMediaElement';

const ARROW_SECONDS = 5;

/**
 * Player de música/áudio — deliberadamente OUTRA forma que a do vídeo (D6 da
 * RFC de anexos): áudio não tem imagem pra ocupar retângulo, então o card é
 * horizontal e o que ganha destaque é o botão de tocar, não a superfície.
 *
 * O título é o nome do arquivo: não há leitura de tag ID3 (ver §11 da RFC).
 */
export default function AudioPlayer({ attachment }: { attachment: AttachmentDTO }) {
  const t = useTranslations('chat.media');
  const locale = useLocale();
  const audioRef = useRef<HTMLAudioElement>(null);
  const media = useMediaElement(audioRef, attachment.durationMs);

  // Mesmo motivo do `formatBytes`: "1,5x" é português, "1.5x" é inglês — era
  // um `.replace('.', ',')` fixo aqui.
  const rateLabel = `${new Intl.NumberFormat(locale).format(media.rate)}x`;

  return (
    <div className="mt-1.5 flex w-[380px] max-w-full items-center gap-3 rounded-[12px] border border-border/50 bg-muted/40 p-2.5">
      <audio ref={audioRef} src={attachment.url} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={media.toggle}
        aria-label={media.playing ? t('pause') : t('play')}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {media.waiting && media.started ? (
          <HugeIcon name="loading-03" size={19} className="animate-spin" />
        ) : (
          <HugeIcon name={media.playing ? 'pause' : 'play'} size={19} className={media.playing ? undefined : 'translate-x-px'} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <HugeIcon name="music-note-01" size={14} className="shrink-0 text-muted-foreground" />
          <span title={attachment.name} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
            {attachment.name}
          </span>

          <button
            type="button"
            onClick={media.cycleRate}
            aria-label={t('playbackRate', { rate: rateLabel })}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {rateLabel}
          </button>

          <VolumeControl
            volume={media.volume}
            muted={media.muted}
            onChange={media.changeVolume}
            onToggleMute={media.toggleMute}
            className="shrink-0 text-muted-foreground"
          />
        </div>

        <MediaScrubber
          value={media.currentTime}
          max={media.duration}
          buffered={media.bufferedEnd}
          onChange={media.seek}
          step={ARROW_SECONDS}
          ariaLabel={t('audioPosition')}
          ariaValueText={formatDuration(media.currentTime)}
          className="mt-1"
        />

        <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{formatDuration(media.currentTime)}</span>
          <span>{media.duration > 0 ? formatDuration(media.duration) : formatBytes(attachment.bytes, locale)}</span>
        </div>
      </div>
    </div>
  );
}
