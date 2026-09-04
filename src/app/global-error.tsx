'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportClientError';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config';

/**
 * Único boundary que cobre VoiceDock/VoiceProvider/CallProvider — eles vivem
 * no RootLayout ao lado de `children`, então um error.tsx de rota (ex.:
 * src/app/channels/error.tsx) não os alcança. Sem <html>/<body> próprios
 * aqui o Next não consegue substituir o layout raiz que quebrou.
 */

/**
 * As ÚNICAS frases do app que não moram em `messages/` — e não por esquecimento.
 *
 * Este boundary SUBSTITUI o layout raiz, e o NextIntlClientProvider mora lá:
 * quando esta tela aparece, não existe mais provider pra `useTranslations` ler.
 * Importar os catálogos direto resolveria, ao custo de arrastar os dois JSON
 * inteiros pro bundle de uma tela que quase nunca renderiza — caro pra três
 * frases. O idioma sai do mesmo cookie que o servidor lê, agora pelo
 * `document.cookie`.
 *
 * Mexeu aqui? As frases equivalentes em `errors.channel` são as vizinhas de
 * tom — vale manter as duas telas falando parecido.
 */
const COPY: Record<Locale, { title: string; description: string; retry: string }> = {
  'pt-BR': {
    title: 'Algo deu errado.',
    description: 'Se você estava numa chamada, o áudio pode continuar ativo. Recarrega a página pra voltar ao normal.',
    retry: 'Tentar de novo',
  },
  'en-US': {
    title: 'Something went wrong.',
    description: 'If you were in a call, the audio may still be live. Reload the page to get back to normal.',
    retry: 'Try again',
  },
};

function readLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match?.[1] && decodeURIComponent(match[1]);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = COPY[readLocale()];

  useEffect(() => {
    reportClientError('global', error);
  }, [error]);

  return (
    <html>
      <body style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem', textAlign: 'center', background: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700 }}>{copy.title}</p>
        <p style={{ maxWidth: '24rem', fontSize: '0.875rem', color: '#a1a1aa' }}>{copy.description}</p>
        <button
          onClick={reset}
          style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.375rem', border: '1px solid #27272a', background: 'transparent', color: '#fafafa', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
        >
          {copy.retry}
        </button>
      </body>
    </html>
  );
}
