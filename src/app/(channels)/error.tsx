'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/reportClientError';

export default function ChannelsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('channels', error);
  }, [error]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm font-bold text-foreground">Algo deu errado nesse canal.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        O áudio da sala não é afetado. Tenta recarregar essa área — se persistir, avisa a gente.
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  );
}
