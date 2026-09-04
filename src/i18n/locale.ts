import { cookies, headers } from 'next/headers';

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, type Locale } from './config';

/**
 * Idioma da request. O cookie manda; sem cookie, negocia pelo `Accept-Language`
 * do navegador.
 *
 * A preferência mora num COOKIE, e não no perfil do usuário no banco, porque a
 * tela de login e o pareamento por QR precisam de idioma antes de existir
 * sessão — e porque idioma é do dispositivo, não da conta: o mesmo usuário pode
 * querer PT no desktop de casa e EN no notebook do trabalho.
 */
export async function getUserLocale(): Promise<Locale> {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return negotiateLocale(headers().get('accept-language'));
}

/**
 * Casa o `Accept-Language` com a lista de suportados sem trazer um negociador
 * inteiro de dependência: primeiro tenta a tag completa (`pt-BR`), depois só a
 * língua (`pt` casa com `pt-BR`) — que é o que importa aqui, já que só existe
 * uma variante de cada língua.
 *
 * Exportado pra ser testável sem `headers()` por perto.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((param) => param.trim().startsWith('q='));
      // `q` ausente vale 1 por definição do cabeçalho; `q` quebrado cai pra 0
      // em vez de derrubar a negociação inteira.
      const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;

    const language = tag.split('-')[0];
    const byLanguage = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === language);
    if (byLanguage) return byLanguage;
  }

  return DEFAULT_LOCALE;
}
