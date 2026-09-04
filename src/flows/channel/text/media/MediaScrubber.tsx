'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type ScrubberTone = 'onDark' | 'default';

const TONE_CLASSES: Record<ScrubberTone, { track: string; buffered: string; fill: string; thumb: string }> = {
  onDark: { track: 'bg-white/25', buffered: 'bg-white/40', fill: 'bg-white', thumb: 'bg-white' },
  default: { track: 'bg-foreground/15', buffered: 'bg-foreground/25', fill: 'bg-primary', thumb: 'bg-primary' },
};

/**
 * Trilho arrastável dos players — serve de barra de busca (com a faixa do que
 * já baixou) e de barra de volume. O `<input type=range>` não desenha buffer,
 * e o Slider do design system tem poço alto de 32px: dentro de uma barra de
 * controle de 420px isso não cabe.
 *
 * Ponteiro em vez de mouse+touch separados: `setPointerCapture` faz o arraste
 * continuar mesmo quando o dedo/cursor sai do trilho, que é o comportamento que
 * todo mundo espera ao passar do fim da barra.
 */
export default function MediaScrubber({
  value,
  max,
  buffered = 0,
  onChange,
  ariaLabel,
  ariaValueText,
  step = 5,
  tone = 'default',
  className,
  trackClassName,
}: {
  value: number;
  max: number;
  buffered?: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  ariaValueText?: string;
  /** Passo das setas do teclado, na unidade do valor (segundos no vídeo, fração no volume). */
  step?: number;
  tone?: ScrubberTone;
  className?: string;
  trackClassName?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const colors = TONE_CLASSES[tone];

  const percentOf = (input: number) => (max > 0 ? Math.min(100, Math.max(0, (input / max) * 100)) : 0);

  const valueAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || max <= 0) return null;
      return (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * max;
    },
    [max],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const next = valueAt(event.clientX);
    if (next === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(next);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = valueAt(event.clientX);
    if (next !== null) onChange(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    if (delta !== 0) {
      event.preventDefault();
      // stopPropagation: o container do player também escuta setas (±5s no
      // vídeo) — sem isso um toque na seta com o trilho focado andaria duas vezes.
      event.stopPropagation();
      onChange(Math.min(Math.max(value + delta, 0), max));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      onChange(event.key === 'Home' ? 0 : max);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      // Volume vai de 0 a 1: arredondar pra inteiro colapsaria a escala inteira em dois valores.
      aria-valuemax={Number(max.toFixed(max <= 1 ? 2 : 0))}
      aria-valuenow={Number(value.toFixed(max <= 1 ? 2 : 0))}
      aria-valuetext={ariaValueText}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
      className={cn('group/scrub relative flex h-3.5 w-full cursor-pointer touch-none items-center focus:outline-none', className)}
    >
      <div className={cn('relative h-1 w-full overflow-hidden rounded-full', colors.track, trackClassName)}>
        <div className={cn('absolute inset-y-0 left-0 rounded-full', colors.buffered)} style={{ width: `${percentOf(buffered)}%` }} />
        <div className={cn('absolute inset-y-0 left-0 rounded-full', colors.fill)} style={{ width: `${percentOf(value)}%` }} />
      </div>

      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute size-3 -translate-x-1/2 rounded-full shadow transition-opacity',
          colors.thumb,
          dragging ? 'opacity-100' : 'opacity-0 group-hover/scrub:opacity-100 group-focus/scrub:opacity-100',
        )}
        style={{ left: `${percentOf(value)}%` }}
      />
    </div>
  );
}
