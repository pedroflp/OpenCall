/**
 * Idiomas do OpenCall. Português é o padrão porque é a língua em que o produto
 * nasceu — quem nunca escolheu nada continua vendo exatamente o que via antes.
 *
 * As tags são BCP 47 completas (`pt-BR`, e não `pt`) porque `Intl` usa isso pra
 * formatar data, número e lista: `pt` sozinho não decide entre 1.234,56 e
 * 1 234,56. Se um dia entrar `pt-PT`, ele é OUTRA entrada desta lista, não uma
 * variante escondida.
 */
export const LOCALES = ['pt-BR', 'en-US'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Cookie de preferência. Lido no servidor a cada request (ver `i18n/request.ts`). */
export const LOCALE_COOKIE = 'opencall.locale';

/**
 * Rótulos ficam FORA dos catálogos de mensagens: o nome de cada idioma é
 * escrito na própria língua ("English", não "Inglês"), então traduzi-los seria
 * errado — quem procura o próprio idioma numa lista procura pelo endônimo.
 */
export const LOCALE_LABELS: Record<Locale, { name: string; short: string }> = {
  'pt-BR': { name: 'Português (Brasil)', short: 'PT' },
  'en-US': { name: 'English (US)', short: 'EN' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
