'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Phase = 'loading' | 'ready' | 'connected' | 'error';

const POLL_INTERVAL_MS = 1500;

export default function LoginQrModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const createPairing = useCallback(async () => {
    stopPolling();
    setPhase('loading');
    setQrDataUrl(null);

    try {
      const res = await fetch('/api/auth/qr', { method: 'POST' });
      if (!res.ok) throw new Error('create failed');
      const { id } = (await res.json()) as { id: string; expiresAt: number };

      const url = `${window.location.origin}/login/qr/${id}`;
      setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
      setPhase('ready');

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/auth/qr/${id}`);
          if (!statusRes.ok) throw new Error('status failed');
          const { status } = (await statusRes.json()) as { status: string };

          if (status === 'consumed') {
            setPhase('connected');
            stopPolling();
          } else if (status === 'expired' || status === 'not_found') {
            setPhase('error');
            stopPolling();
          }
        } catch {
          // erro de rede pontual no polling não derruba o modal — só tenta de novo no próximo tick
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setPhase('error');
    }
  }, [stopPolling]);

  useEffect(() => {
    if (open) {
      void createPairing();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [open, createPairing, stopPolling]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Entrar via QR code</DialogTitle>
          <DialogDescription>Escaneia com a câmera do celular pra entrar sem digitar nada.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {phase === 'loading' && <HugeIcon name="loading-03" size={28} className="animate-spin text-primary" />}

          {phase === 'ready' && qrDataUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerado no client, next/image não otimiza URIs desse tipo */}
              <img src={qrDataUrl} alt="QR code de login" width={240} height={240} className="rounded-lg" />
              <p className="text-xs text-muted-foreground">Expira em 2 minutos</p>
            </>
          )}

          {phase === 'connected' && (
            <>
              <HugeIcon name="checkmark-circle-01" size={32} className="text-primary" />
              <p className="text-sm font-bold text-foreground">Celular conectado!</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <p className="text-sm text-muted-foreground">O código expirou.</p>
              <Button type="button" size="sm" onClick={() => void createPairing()}>
                Gerar novo código
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
