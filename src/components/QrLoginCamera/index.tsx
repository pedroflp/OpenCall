'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { cn } from '@/lib/utils';

type ScanState = 'requesting' | 'scanning' | 'denied' | 'unsupported';

/** Só decodifica um frame a cada intervalo — rodar jsQR em todo frame de rAF é caro à toa num QR parado na tela. */
const DECODE_INTERVAL_MS = 200;
/** Downscale antes de decodificar — resolução nativa da câmera é overkill pra ler um QR e pesa no jsQR em celular fraco. */
const MAX_DECODE_WIDTH = 480;

function isLoginQrUrl(text: string): URL | null {
  try {
    const url = new URL(text, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!/^\/login\/qr\/[^/]+$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * A câmera do lado "leitor" do pareamento por QR (ver LoginPopover, que abre
 * este componente inline, e QrLoginScanner, que o hospeda num Dialog próprio
 * pra quem já viu o popover e reabre pelo rodapé da sidebar). Decodifica
 * localmente com jsQR a partir de frames da câmera — sem enviar vídeo pra
 * lugar nenhum — e, ao achar uma URL /login/qr/{id} do próprio site, navega
 * pra lá: essa página já dispara o confirm sozinha.
 *
 * Arquivo próprio, e não um trecho de cada host: o que está aqui é a mecânica
 * da leitura (permissão, ciclo de frames, decode), e cada host só decide como
 * apresentar isso — dois hosts com a mesma lógica de câmera divergindo é
 * exatamente o tipo de bug que só aparece quando um dos dois já não é mais
 * testado.
 *
 * `active` é o liga/desliga da câmera — enquanto false não pede permissão nem
 * segura track nenhuma, que é o que deixa o dono decidir quando o vídeo começa
 * (montar o componente escondido não pode acender a luz da webcam).
 */
export default function QrLoginCamera({ active, className }: { active: boolean; className?: string }) {
  const t = useTranslations('auth.camera');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>('requesting');

  useEffect(() => {
    if (!active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let lastDecodeAt = 0;
    setState('requesting');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick(now: number) {
      const video = videoRef.current;
      if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA && now - lastDecodeAt >= DECODE_INTERVAL_MS) {
        lastDecodeAt = now;

        const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height);

        const target = code?.data ? isLoginQrUrl(code.data) : null;
        if (target) {
          window.location.href = target.toString();
          return;
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
        setState('scanning');
        rafId = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setState('denied');
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active]);

  if (state === 'denied') {
    return (
      <p className="text-sm text-muted-foreground">{t('denied')}</p>
    );
  }

  if (state === 'unsupported') {
    return <p className="text-sm text-muted-foreground">{t('unsupported')}</p>;
  }

  return (
    <div className={cn('relative aspect-square w-full overflow-hidden rounded-2xl bg-black', className)}>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      {state === 'requesting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <HugeIcon name="loading-03" size={28} className="animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
