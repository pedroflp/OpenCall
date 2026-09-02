'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import Image from 'next/image';
import { HugeIcon } from '@/components/HugeIcon';

interface LightboxImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Vai pro body via portal: dentro da coluna do canal o overlay ficava preso ao
 * `overflow-hidden` do container e passava por baixo das sidebars (canais e
 * atividade), que são irmãs na mesma stacking order. Fechar não mexe no scroll
 * da lista, então a posição continua preservada de graça (ver A10 da RFC-008).
 */
export default function ImageLightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-muted/60 text-foreground hover:bg-muted"
      >
        <HugeIcon name="cancel-01" size={18} />
      </button>

      <div className="relative max-h-[85vh] max-w-[90vw]" onClick={(event) => event.stopPropagation()}>
        <Image
          src={image.url}
          alt=""
          width={image.width}
          height={image.height}
          className="max-h-[85vh] w-auto max-w-[90vw] rounded-lg object-contain"
          unoptimized
        />
      </div>
    </div>,
    document.body,
  );
}
