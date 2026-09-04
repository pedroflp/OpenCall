import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

// Ícones gerados a partir de public/opencall-logo.png, o ícone oficial do
// OpenCall (ver public/README.md). Numa instalação com marca própria, troque
// nome/ícones aqui.
//
// `async` porque a descrição é traduzida — é o texto que o instalador do PWA
// mostra, então segue o idioma escolhido. O efeito colateral é o manifesto
// deixar de ser estático e passar a ser servido por request, o que é aceitável:
// o navegador o busca uma vez, na instalação.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('app');

  return {
    name: 'OpenCall',
    short_name: 'OpenCall',
    description: t('description'),
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/opencall-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/opencall-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
