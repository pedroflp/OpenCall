# ADR-0008: O tema Liquid Glass fica no OpenCall+, não no OpenCall web

**Status**: Aceita
**RFC relacionada**: [rfc-migracao-tdc](../rfc-migracao-tdc.md)

## Contexto

O `tdc` reescreveu toda a identidade visual do `channels` no commit `890b2b9`: `styles/theme.css` (1035L), `styles/liquid-glass.css` (1021L), `grainient`, todos os primitivos `ui/*` (`button`, `input`, `dialog`, `select`, `slider`, `switch`, `tooltip`, `badge`, `popover-liquid-glass`, `surface`), um `ThemeProvider` com três materiais selecionáveis, um `MotionProvider`, e uma casca estrutural nova (`liquid-glass/FloatingDock` e `liquid-glass/ChannelsSidebar`) que **substituiu e deletou** o `VoiceDock/index.tsx` e o `VoiceChannelSidebar.tsx` — os arquivos que o OpenCall usa.

O tema funciona no navegador: o passthrough de material nativo é a única parte condicionada ao Electron, e fora dele a classe é inerte. Ou seja, migrá-lo para o web era tecnicamente viável.

## Decisão

**O Liquid Glass fica no OpenCall+.** O OpenCall web mantém o design atual (`VoiceDock/index.tsx` + `VoiceChannelSidebar.tsx`).

## Alternativas consideradas

- **Liquid Glass no OpenCall web.** Evitaria manter dois sistemas de design divergentes e daria ao web a identidade visual mais recente. Rejeitada por decisão de produto: o OpenCall+ precisa de diferenciação visual própria, e essa é a diferenciação.

- **Só os primitivos (`ui/*`, `surface`, `motion`) no web, a casca no OpenCall+.** Rejeitada: entrega ao web um conjunto de primitivos sem a casca que os justifica — o resultado seria um design system pela metade, sem identidade nem no web nem coerência com o OpenCall+.

## Consequências

- O `SettingsDialog` migra reduzido. `LayoutTab` (122L) é o seletor de material do Liquid Glass e não vem; `ThemePreviewCard` e `UIZoomSlider` vão junto para o OpenCall+. Restam Perfil, Áudio/Vídeo e Conta (ver §5.1 da RFC).
- A coluna `theme` do `User` no `tdc` não entra na migration do OpenCall.
- Quatro arquivos do chat rico importam `ui/popover-liquid-glass` e precisam apontar para `ui/popover` na cópia (`MessageComposer`, `MessageItem`, `GifPickerPopover`, `EmojiPickerPopover`). Custo real: uma linha cada.
- O OpenCall fica com um design que o `tdc` já deletou. Todo port futuro a partir do `tdc` passa a exigir tradução visual, não só cópia — este é o custo recorrente aceito nesta decisão.
- Como o OpenCall+ é repositório separado (ADR-0010), o tema precisa conviver com uma interface que ele não controla. Definir esse mecanismo é problema do OpenCall+, não desta migração.
