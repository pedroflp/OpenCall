'use client';

import { useCallback, useState } from 'react';
import { guessAttachmentKind, MAX_ATTACHMENT_BYTES, type AttachmentKind } from '@/lib/chat/attachments';

export interface PendingAttachment {
  file: File;
  kind: AttachmentKind;
  /** blob: local — miniatura do compositor e fonte da mensagem otimista até o upload confirmar. */
  previewUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: 'reading' | 'ready' | 'error';
  /** Tamanho é o único erro que impede o envio — não conseguir medir vira anexo de arquivo (ver §5.6 da RFC de anexos). */
  error?: 'ATTACHMENT_TOO_LARGE';
}

interface Measurements {
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Browser travado num arquivo que ele não decodifica nunca dispara load nem error — sem o teto, o anexo ficaria "lendo" pra sempre e não daria pra enviar. */
const MEASURE_TIMEOUT_MS = 8_000;

function measureImage(url: string): Promise<Measurements> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, durationMs: null });
    img.onerror = () => reject(new Error('UNREADABLE'));
    img.src = url;
  });
}

function measureMedia(url: string, tag: 'video' | 'audio'): Promise<Measurements> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      // Duração infinita/NaN é o que browser devolve pra stream sem índice —
      // vale mais não mostrar duração que mostrar "Infinity:NaN".
      const seconds = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      const video = tag === 'video' ? (el as HTMLVideoElement) : null;
      resolve({
        width: video?.videoWidth || null,
        height: video?.videoHeight || null,
        durationMs: seconds === null ? null : Math.round(seconds * 1000),
      });
    };
    el.onerror = () => reject(new Error('UNREADABLE'));
    el.src = url;
  });
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), MEASURE_TIMEOUT_MS)),
  ]);
}

function measure(kind: AttachmentKind, url: string): Promise<Measurements> {
  if (kind === 'IMAGE') return withTimeout(measureImage(url));
  if (kind === 'VIDEO') return withTimeout(measureMedia(url, 'video'));
  if (kind === 'AUDIO') return withTimeout(measureMedia(url, 'audio'));
  return Promise.resolve({ width: null, height: null, durationMs: null });
}

/**
 * Só valida o tamanho, mede o que dá pra medir e gera o preview local (blob:) —
 * nenhum byte sobe pro R2 aqui. O upload de verdade só acontece no submit da
 * mensagem (ver useChatMessages.sendMessage), pra um anexo descartado antes de
 * enviar nunca virar objeto órfão no bucket.
 *
 * Qualquer arquivo é aceito. Não conseguir medir (um .heic que o Chrome não
 * decodifica, um .mkv que o <video> recusa) REBAIXA o anexo pra arquivo em vez
 * de barrar o envio — era o que fazia o hook antigo devolver INVALID_IMAGE e
 * matar o anexo ali.
 */
export function useChatAttachment() {
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);

  const startAttach = useCallback(async (file: File) => {
    const kind = guessAttachmentKind(file.type);
    const previewUrl = URL.createObjectURL(file);
    const tooLarge = file.size > MAX_ATTACHMENT_BYTES[kind];

    setAttachment((prev) => {
      // Trocar de anexo sem revogar o blob anterior segura o arquivo inteiro na
      // memória da aba até ela fechar — com vídeo de 100MB isso aparece rápido.
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        kind,
        previewUrl,
        width: null,
        height: null,
        durationMs: null,
        ...(tooLarge ? { status: 'error' as const, error: 'ATTACHMENT_TOO_LARGE' as const } : { status: 'reading' as const }),
      };
    });

    if (tooLarge) return;

    const measured = await measure(kind, previewUrl).catch(() => null);

    setAttachment((prev) => {
      if (!prev || prev.file !== file) return prev;
      if (measured) return { ...prev, ...measured, status: 'ready' };
      // Rebaixado: o teto de FILE é menor que o de vídeo, então o tamanho é
      // conferido de novo com a régua nova.
      if (file.size > MAX_ATTACHMENT_BYTES.FILE) return { ...prev, kind: 'FILE', status: 'error', error: 'ATTACHMENT_TOO_LARGE' };
      return { ...prev, kind: 'FILE', status: 'ready' };
    });
  }, []);

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

  // Sem "tentar de novo": o único erro possível é tamanho, e tentar de novo com
  // o mesmo arquivo dá no mesmo. Falha de leitura vira anexo de arquivo, não erro.
  return { attachment, startAttach, clear, release };
}
