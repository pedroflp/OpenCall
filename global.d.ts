import type { LOCALES } from '@/i18n/config';
import type messages from './messages/pt-BR.json';

/**
 * Deixa o `t('...')` checado pelo TypeScript: chave que não existe em
 * `messages/pt-BR.json` vira erro de compilação, não string crua na tela.
 *
 * pt-BR é a FONTE do tipo por ser o idioma em que as telas são escritas — é
 * onde a chave nasce. Consequência de propósito: `en-US.json` fora de forma
 * quebra o build (ver o teste de paridade no fim de messages/README.md).
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
    Messages: typeof messages;
  }
}
