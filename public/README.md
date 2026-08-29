# Assets

Este projeto ainda não tem identidade visual própria — a instalação de origem
usava outra marca, e os ícones dela não foram copiados de propósito.

Referências que esperam arquivos aqui:

- `public/icons/opencall-192.png`, `opencall-512.png`, `opencall-apple-touch.png`
  (manifest.ts, layout.tsx)
- `public/assets/icons/opencall-banner.png` → troque pela sua própria imagem de banner
  do canal (SectionsSidebar, VoiceChannelSidebar)

O build funciona sem esses arquivos (o Next só referencia os paths via
metadata/`<Image>`); eles só faltam visualmente até serem adicionados.
