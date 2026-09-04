'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/reportClientError';

export default function ChannelsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Boundary de ROTA: o layout raiz (e com ele o NextIntlClientProvider)
  // continua de pé, então dá pra traduzir normalmente aqui. O global-error.tsx
  // é o caso oposto — ver o comentário de lá.
  const t = useTranslations('errors.channel');
  const tCommon = useTranslations('common');

  useEffect(() => {
    reportClientError('channels', error);
  }, [error]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm font-bold text-foreground">{t('title')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t('description')}</p>
      <Button variant="outline" size="sm" onClick={reset}>
        {tCommon('retry')}
      </Button>
    </div>
  );
}
