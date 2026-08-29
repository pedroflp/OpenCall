'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { HugeIcon } from '@/components/HugeIcon';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '../ui/button';

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
 * Lado "leitor" do pareamento por QR (ver LoginQrModal, que gera o código no
 * PC já logado). Decodifica localmente com jsQR a partir de frames da câmera
 * — sem enviar vídeo pra lugar nenhum — e, ao achar uma URL /login/qr/{id}
 * do próprio site, navega pra lá: essa página já dispara o confirm sozinha.
 */
export default function QrLoginScanner({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>('requesting');

  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>Leia o QR Code</DialogTitle>
          <DialogDescription><b>Dentro do OpenCall</b> clique no botão <Button
            variant="outline"
            size="sm"
            className='gap-1 text-[10px] px-1.5 h-6 pointer-events-none'
          >
            <HugeIcon name="qr-code-01" size={16} />
            Entrar com QR Code
          </Button> para gerar o código de acesso e fazer a leitura!</DialogDescription>

        </DialogHeader>

        {state === 'denied' ? (
          <p className="text-sm text-muted-foreground">
            Sem acesso à câmera. Permite o acesso nas configurações do navegador e tenta de novo.
          </p>
        ) : state === 'unsupported' ? (
          <p className="text-sm text-muted-foreground">Esse navegador não dá acesso à câmera.</p>
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {state === 'requesting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <HugeIcon name="loading-03" size={28} className="animate-spin text-white" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
