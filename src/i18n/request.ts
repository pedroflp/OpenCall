import { getRequestConfig } from 'next-intl/server';

import { getUserLocale } from './locale';

/**
 * Ponto de entrada do next-intl no servidor — o plugin do `next.config.mjs`
 * aponta pra cá.
 *
 * Não há roteamento por idioma: as rotas do OpenCall são `/canal`, `/admin`,
 * `/login`, e prefixar tudo com `/pt-BR` só pra trocar de língua quebraria todo
 * link já compartilhado por aí (e o app é um só, atrás de login, sem SEO pra
 * ganhar com isso). O idioma vem do cookie, resolvido em `getUserLocale`.
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    /**
     * Fuso e "agora" ficam com o padrão do next-intl (fuso do servidor, data da
     * request). Quem formata hora de mensagem no chat usa `date-fns` no
     * cliente, com o fuso REAL de quem lê — trocar isso aqui só criaria uma
     * segunda fonte de verdade.
     */
  };
});
