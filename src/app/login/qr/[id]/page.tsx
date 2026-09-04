'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { routeNames } from '@/app/route.names';

type Status = 'confirming' | 'invalid';

/**
 * Aberta pelo celular ao escanear o QR gerado no dispositivo já logado (ver
 * QrLoginScanner) — dispara a confirmação assim que monta (sem toque extra) e
 * deixa o navegador seguir pra home já com o cookie de sessão setado pela
 * resposta do confirm.
 */
export default function LoginQrPage({ params }: { params: { id: string } }) {
  const t = useTranslations('auth.qrPage');
  const [status, setStatus] = useState<Status>('confirming');

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/auth/qr/${params.id}/confirm`, { method: 'POST' })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          window.location.replace(routeNames.HOME);
          return;
        }
        setStatus('invalid');
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      {status === 'confirming' ? (
        <>
          <HugeIcon name="loading-03" size={28} className="animate-spin text-primary" />
          <p className="text-sm font-bold">{t('signingIn')}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold">{t('expiredTitle')}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t('expiredDescription')}</p>
        </>
      )}
    </div>
  );
}
