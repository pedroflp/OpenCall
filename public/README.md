# Assets

O OpenCall tem ícone próprio: `public/opencall-logo.png` (1000×1000, fundo
transparente). É a fonte de verdade da marca — os ícones abaixo são recortes
dele em tamanhos fixos, e o mesmo arquivo é usado no site de documentação
(`opencall-docs`) como logo e favicon.

Gerados a partir de `opencall-logo.png` (com `sips`, no macOS):

- `public/icons/opencall-192.png` (192×192) e `opencall-512.png` (512×512) — manifest.ts
- `public/icons/opencall-apple-touch.png` (180×180) — layout.tsx

```sh
sips -s format png -z 192 192 public/opencall-logo.png --out public/icons/opencall-192.png
sips -s format png -z 512 512 public/opencall-logo.png --out public/icons/opencall-512.png
sips -s format png -z 180 180 public/opencall-logo.png --out public/icons/opencall-apple-touch.png
```

O PNG já vem com transparência e uma folga interna em volta do glifo — o
arredondamento de canto onde ele aparece como logo dentro de uma UI é reforço
CSS (`rounded-2xl`), não corte da imagem.

Ainda falta um asset, que é branding por instalação e não da marca OpenCall:

- `public/assets/icons/opencall-banner.png` → sua própria imagem de banner do
  canal (SectionsSidebar, VoiceChannelSidebar)

O build funciona sem ele (o Next só referencia o path via `<Image>`); só falta
visualmente até ser adicionado.
