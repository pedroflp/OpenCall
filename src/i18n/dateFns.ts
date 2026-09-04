'use client';

import { enUS, ptBR } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import { useLocale } from 'next-intl';

import { type Locale } from './config';

/**
 * A ponte entre o idioma do app e o do `date-fns`.
 *
 * Existe porque as duas bibliotecas nomeiam locale de jeitos diferentes
 * (`pt-BR` aqui, `ptBR` lá) e porque o `date-fns` quer o OBJETO de locale
 * importado, não a tag — não dá pra montar o nome do import em runtime.
 * Sem isto, "há 5 minutos" continuaria em português numa interface em inglês.
 */
const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/** O locale do `date-fns` correspondente ao idioma escolhido. */
export function useDateFnsLocale(): DateFnsLocale {
  return DATE_FNS_LOCALES[useLocale()];
}
