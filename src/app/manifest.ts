import type { MetadataRoute } from 'next';

// Ícones gerados a partir de public/logo.png, o ícone oficial do OpenCall
// (ver public/README.md). Numa instalação com marca própria, troque
// nome/ícones aqui.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenCall',
    short_name: 'OpenCall',
    description: 'Voz, vídeo e chat de comunidade — self-hosted.',
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
