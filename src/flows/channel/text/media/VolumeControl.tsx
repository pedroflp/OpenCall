'use client';

import { HugeIcon } from '@/components/HugeIcon';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import MediaScrubber, { type ScrubberTone } from './MediaScrubber';

function volumeIcon(volume: number, muted: boolean): string {
  if (muted || volume === 0) return 'volume-off';
  if (volume < 0.5) return 'volume-low';
  return 'volume-high';
}

/**
 * Botão de mudo com o trilho de volume aparecendo no hover — numa barra de
 * 420px um trilho fixo comeria o espaço do tempo e dos outros botões, e volume
 * é ajuste ocasional, não permanente.
 */
export default function VolumeControl({
  volume,
  muted,
  onChange,
  onToggleMute,
  tone = 'default',
  className,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number) => void;
  onToggleMute: () => void;
  tone?: ScrubberTone;
  className?: string;
}) {
  const t = useTranslations('chat.media');
  const effective = muted ? 0 : volume;

  return (
    <div className={cn('group/volume flex items-center', className)}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted || volume === 0 ? t('unmute') : t('mute')}
        className="flex size-7 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <HugeIcon name={volumeIcon(volume, muted)} size={17} />
      </button>

      <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/volume:w-[62px] group-focus-within/volume:w-[62px]">
        <MediaScrubber
          value={effective}
          max={1}
          step={0.1}
          tone={tone}
          onChange={(next) => onChange(next)}
          ariaLabel={t('volume')}
          ariaValueText={`${Math.round(effective * 100)}%`}
          className="ml-1 w-[54px]"
        />
      </div>
    </div>
  );
}
