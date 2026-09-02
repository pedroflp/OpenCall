'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatAccessCode } from '@/lib/auth/accessCode';
import { cn } from '@/lib/utils';

type Phase = 'loading' | 'ready' | 'connected' | 'error';

const POLL_INTERVAL_MS = 1500;

/**
 * Corpo do pareamento de dispositivo: cria assim que monta (abrir o modal
 * "Entrar em outro dispositivo" já é o pedido), mostra QR e código juntos, e
 * faz polling até o outro dispositivo confirmar.
 */
export default function DevicePairingPanel({ active, className }: { active: boolean; className?: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
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
    setCode(null);

    try {
      const res = await fetch('/api/auth/qr', { method: 'POST' });
      if (!res.ok) throw new Error('create failed');
      const pairing = (await res.json()) as { id: string; code: string; expiresAt: number };

      const url = `${window.location.origin}/login/qr/${pairing.id}`;
      setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
      setCode(pairing.code);
      setPhase('ready');

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/auth/qr/${pairing.id}`);
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
          // erro de rede pontual no polling não derruba o painel — só tenta de novo no próximo tick
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setPhase('error');
    }
  }, [stopPolling]);

  useEffect(() => {
    if (active) void createPairing();
    else stopPolling();
    return stopPolling;
  }, [active, createPairing, stopPolling]);

  return (
    <div className={cn('flex flex-col items-center gap-3 py-2', className)}>
      {phase === 'loading' && <PairingSkeleton />}

      {phase === 'ready' && qrDataUrl && code && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerado no client, next/image não otimiza URIs desse tipo */}
          <img src={qrDataUrl} alt="QR code de login" width={240} height={240} className="rounded-lg" />

          <div className="flex w-full items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">ou digita</span>
            <Separator className="flex-1" />
          </div>

          <p className="rounded-xl bg-muted px-5 py-2 font-mono text-2xl font-bold tracking-widest text-foreground">
            {formatAccessCode(code)}
          </p>
          <p className="text-xs text-muted-foreground">Expira em 2 minutos</p>
        </>
      )}

      {phase === 'connected' && (
        <>
          <HugeIcon name="checkmark-circle-01" size={32} className="text-primary" />
          <p className="text-sm font-bold text-foreground">Dispositivo conectado!</p>
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
  );
}

/**
 * A moldura do estado `ready` enquanto o pareamento não voltou do servidor:
 * mesmo quadrado de 240px do QR, mesma régua "ou digita", mesma cápsula do
 * código e mesma linha de expiração — sem isso o painel mudaria de altura
 * duas vezes em menos de um segundo.
 */
function PairingSkeleton() {
  return (
    <>
      <div className="size-60 animate-pulse rounded-lg bg-muted/60" />

      <div className="flex w-full items-center gap-3">
        <Separator className="flex-1" />
        <div className="h-4 w-16 animate-pulse rounded-md bg-muted/40" />
        <Separator className="flex-1" />
      </div>

      <div className="h-12 w-36 animate-pulse rounded-xl bg-muted/60" />
      <div className="h-4 w-28 animate-pulse rounded-md bg-muted/40" />
    </>
  );
}
