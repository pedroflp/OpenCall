'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { GifDTO } from '@/lib/chat/giphy';

/** 2s: cada tecla custa uma chamada à API do GIPHY, então só busca quando a pessoa realmente parou de digitar. */
const SEARCH_DEBOUNCE_MS = 2_000;

/**
 * Marca do GIPHY (moldura + degrau, sem o wordmark, que não lê em 22px).
 * Exceção consciente à regra "só HugeIcon" deste diretório: é logo de marca,
 * não ícone de UI, e o hugeicons não tem. Geometria e cores extraídas do PNG
 * oficial (giphy_logo_square_social.png), viewBox no recorte da moldura.
 */
function GiphyMark({ size }: { size: number }) {
  return (
    <svg viewBox="70 21 162 201" height={size} width={(size * 162) / 201} aria-hidden focusable="false">
      <rect x="70" y="21" width="102" height="22" fill="#fff39f" />
      <rect x="172" y="21" width="20" height="22" fill="#fb6769" />
      <rect x="172" y="43" width="42" height="21" fill="#fb6769" />
      <rect x="172" y="64" width="60" height="21" fill="#fb6769" />
      <rect x="210" y="85" width="22" height="20" fill="#4a1f7c" />
      <rect x="210" y="105" width="22" height="94" fill="#9740fa" />
      <rect x="70" y="43" width="22" height="156" fill="#2afc9c" />
      <rect x="70" y="199" width="162" height="23" fill="#22cdfb" />
    </svg>
  );
}

/** Distribui em 2 colunas pela menor altura acumulada — masonry sem lib, com o aspect real de cada GIF. */
function toColumns(gifs: GifDTO[]): GifDTO[][] {
  const columns: GifDTO[][] = [[], []];
  const heights = [0, 0];

  for (const gif of gifs) {
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(gif);
    heights[target] += gif.previewHeight / gif.previewWidth;
  }
  return columns;
}

function GifGrid({ gifs, onPick }: { gifs: GifDTO[]; onPick: (gif: GifDTO) => void }) {
  return (
    <div className="flex gap-1.5">
      {toColumns(gifs).map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-1.5">
          {column.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => onPick(gif)}
              title={gif.title}
              className="overflow-hidden rounded-md bg-muted/40 ring-primary transition-shadow hover:ring-2"
              style={{ aspectRatio: `${gif.previewWidth} / ${gif.previewHeight}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- preview animado do Giphy: next/image devolve frame estático. */}
              <img src={gif.previewUrl} alt={gif.title} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function GifPickerPopover({ onPick }: { onPick: (url: string) => void }) {
  const t = useTranslations('chat.gif');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Uma busca por vez: a resposta de uma tecla antiga não pode sobrescrever a
  // da tecla atual, então cada requisição carrega seu próprio abort.
  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/chat/giphy?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('GIPHY_FAILED');
        const data = (await response.json()) as { gifs: GifDTO[] };
        setGifs(data.gifs);
      } catch (error) {
        if (controller.signal.aborted) return;
        setGifs([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, query]);

  const handlePick = useCallback(
    (gif: GifDTO) => {
      setOpen(false);
      setQuery('');
      onPick(gif.url);
    },
    [onPick],
  );

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('send')}
              className={cn('shrink-0 opacity-70 transition-opacity hover:opacity-100', open && 'opacity-100')}
            >
              <GiphyMark size={22} />
            </button>
          </TooltipTrigger>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="flex h-[420px] w-[340px] flex-col gap-2 p-2"
        >
          <SearchField
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchPlaceholder')}
            className="shrink-0"
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {failed ? (
              <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">{t('failed')}</p>
            ) : gifs.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
                {loading ? t('searching') : t('noResults')}
              </p>
            ) : (
              <div className={cn(loading && 'opacity-60')}>
                <GifGrid gifs={gifs} onPick={handlePick} />
              </div>
            )}
          </div>

          {/* Atribuição é exigência dos termos de uso da API do GIPHY, não enfeite. */}
          <p className="shrink-0 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('poweredBy')}</p>
        </PopoverContent>
      </Popover>
      <TooltipContent>{t('send')}</TooltipContent>
    </Tooltip>
  );
}
