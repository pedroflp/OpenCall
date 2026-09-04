'use server';

import { cookies } from 'next/headers';

import { isLocale, LOCALE_COOKIE, type Locale } from './config';

/** Um ano: idioma é preferência de longo prazo, não estado de sessão. */
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Grava a escolha de idioma. Quem chama é o seletor das Configurações, que logo
 * depois dá `router.refresh()` — o layout raiz relê o cookie e devolve o
 * catálogo novo sem descarregar a página (e sem derrubar a chamada de voz em
 * andamento, que é justamente o que um `location.reload()` faria).
 *
 * Não é `httpOnly`: o valor não é segredo e um dia pode ser útil no cliente. É
 * `sameSite: 'lax'` e `path: '/'` pelo motivo trivial — vale pro app inteiro.
 */
export async function setUserLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  cookies().set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: 'lax',
  });
}
