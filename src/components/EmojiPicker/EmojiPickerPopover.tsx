'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Picker do emoji-mart mexe com um custom element internamente — carregado só
// no client (ssr: false) pra não tentar registrar isso durante o SSR do Next.
const Picker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

interface EmojiMartSelection {
  native: string;
}

/**
 * Picker de emoji compartilhado: usado tanto pelo ícone de identificação de
 * clipe do soundboard (ver SoundboardUploadModal) quanto pelo composer do
 * chat de texto. `data` do @emoji-mart/data já vem no pacote (sem fetch de
 * CDN em runtime) — de propósito, pra não introduzir dependência externa.
 */
export default function EmojiPickerPopover({
  onSelect,
  children,
  side = 'top',
  align = 'start',
  container,
}: {
  onSelect: (emoji: string) => void;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /**
   * Portaliza o popover dentro desse elemento em vez do document.body — precisa
   * quando o trigger está dentro de um Dialog modal (ex: SoundboardUploadModal):
   * o RemoveScroll do Dialog só libera scroll dentro do próprio DialogContent,
   * então um popover portalizado pro body (fora dessa árvore) fica com o scroll
   * do Picker travado junto com o resto da página. Mesma solução do `container`
   * de PopoverContent usada pro caso de fullscreen (ver ui/popover.tsx).
   */
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* overflow-hidden porque o picker do emoji-mart é opaco, tem raio
          próprio e com p-0 encosta na borda: sem clipe, os cantos quadrados
          dele apareceriam por dentro dos 18px do popover de vidro. */}
      <PopoverContent side={side} align={align} sideOffset={8} container={container} className="w-auto overflow-hidden border-0 p-0">
        {open && (
          <Picker
            data={data}
            theme="dark"
            previewPosition="none"
            skinTonePosition="search"
            onEmojiSelect={(emoji: EmojiMartSelection) => {
              onSelect(emoji.native);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
