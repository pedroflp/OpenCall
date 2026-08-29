'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportClientError';

/**
 * Único boundary que cobre VoiceDock/VoiceProvider/CallProvider — eles vivem
 * no RootLayout ao lado de `children`, então um error.tsx de rota (ex.:
 * src/app/channels/error.tsx) não os alcança. Sem <html>/<body> próprios
 * aqui o Next não consegue substituir o layout raiz que quebrou.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('global', error);
  }, [error]);

  return (
    <html>
      <body style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem', textAlign: 'center', background: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700 }}>Algo deu errado.</p>
        <p style={{ maxWidth: '24rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
          Se você estava numa chamada, o áudio pode continuar ativo. Recarrega a página pra voltar ao normal.
        </p>
        <button
          onClick={reset}
          style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.375rem', border: '1px solid #27272a', background: 'transparent', color: '#fafafa', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
