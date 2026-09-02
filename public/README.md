# Assets

O OpenCall tem ícone próprio: `public/logo.png` (1254×1254, quadrado, fundo
preto). É a fonte de verdade da marca — os ícones abaixo são recortes dele em
tamanhos fixos, e o mesmo arquivo é usado no site de documentação
(`opencall-docs`) como logo e favicon.

Gerados a partir de `logo.png` (com `sips`, no macOS):

- `public/icons/opencall-192.png` (192×192) e `opencall-512.png` (512×512) — manifest.ts
- `public/icons/opencall-apple-touch.png` (180×180) — layout.tsx

```sh
sips -s format png -z 192 192 public/logo.png --out public/icons/opencall-192.png
sips -s format png -z 512 512 public/logo.png --out public/icons/opencall-512.png
sips -s format png -z 180 180 public/logo.png --out public/icons/opencall-apple-touch.png
```

O canto arredondado NÃO está gravado no PNG de propósito: no manifest/apple-touch
quem arredonda é o próprio sistema operacional, e gravar o raio faria o ícone
aparecer com canto duplo. Onde ele aparece como logo dentro de uma UI, o
arredondamento é CSS (`rounded-2xl`).

Ainda falta um asset, que é branding por instalação e não da marca OpenCall:

- `public/assets/icons/opencall-banner.png` → sua própria imagem de banner do
  canal (SectionsSidebar, VoiceChannelSidebar)

O build funciona sem ele (o Next só referencia o path via `<Image>`); só falta
visualmente até ser adicionado.
