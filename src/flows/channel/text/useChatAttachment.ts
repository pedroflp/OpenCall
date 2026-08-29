'use client';

import { useCallback, useState } from 'react';
import { IMAGE_CONTENT_TYPE_EXT, MAX_IMAGE_BYTES } from '@/lib/chat/channel';

export interface PendingAttachment {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  status: 'reading' | 'ready' | 'error';
  error?: string;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('INVALID_IMAGE'));
    };
    img.src = url;
  });
}

/**
 * Só valida, lê dimensões e gera o preview local (blob:) — nenhum byte sobe
 * pro R2 aqui. O upload de verdade só acontece no submit da mensagem (ver
 * useChatMessages.sendMessage), pra um anexo descartado antes de enviar nunca
 * virar objeto órfão no bucket.
 */
export function useChatAttachment() {
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);

  const startAttach = useCallback(async (file: File) => {
    if (!(file.type in IMAGE_CONTENT_TYPE_EXT)) {
      setAttachment({ file, previewUrl: '', width: 0, height: 0, status: 'error', error: 'UNSUPPORTED_CONTENT_TYPE' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachment({ file, previewUrl: URL.createObjectURL(file), width: 0, height: 0, status: 'error', error: 'IMAGE_TOO_LARGE' });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachment({ file, previewUrl, width: 0, height: 0, status: 'reading' });

    try {
      const { width, height } = await readImageDimensions(file);
      setAttachment((prev) => (prev && prev.file === file ? { ...prev, width, height, status: 'ready' } : prev));
    } catch {
      setAttachment((prev) => (prev && prev.file === file ? { ...prev, status: 'error', error: 'INVALID_IMAGE' } : prev));
    }
  }, []);

  const retry = useCallback(() => {
    if (attachment) void startAttach(attachment.file);
  }, [attachment, startAttach]);

  /** Botão "remover" do usuário — o anexo nunca foi usado, revoga o blob. */
  const clear = useCallback(() => {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  /** Handoff pro envio — o preview (previewUrl) passa a ser dono da mensagem otimista até ela ser confirmada ou descartada (ver useChatMessages), então NÃO revoga aqui. */
  const release = useCallback(() => {
    setAttachment(null);
  }, []);

  return { attachment, startAttach, retry, clear, release };
}
