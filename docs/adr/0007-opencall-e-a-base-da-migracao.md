# ADR-0007: O OpenCall é a base da migração, não o `tdc`

**Status**: Aceita
**RFC relacionada**: [rfc-migracao-tdc](../rfc-migracao-tdc.md)

## Contexto

O OpenCall foi extraído do `tdc` em 2026-08-22. Depois disso os dois repositórios evoluíram em paralelo e em direções incompatíveis: o `tdc` acumulou 87 commits (app desktop, Liquid Glass, soundboard, noise gate, chat rico, máscara de perfil) enquanto o OpenCall implementou os canais dinâmicos (RFC [rfc-dynamic-channels](../rfc-dynamic-channels.md), ADRs 0001–0006).

A divergência é bidirecional: 128 arquivos existem nos dois repositórios com conteúdo diferente, e os arquivos centrais mudaram demais para admitir merge textual (`VoiceProvider.tsx` tem 1399 linhas de diff; `globals.css` foi de 125 para 731 linhas).

Havia três caminhos: adotar o OpenCall como base e portar o `tdc` para dentro dele; adotar o `tdc`-web como base e reaplicar os canais dinâmicos por cima; ou dividir por camada (backend do OpenCall, interface do `tdc`).

## Decisão

**O OpenCall é a base.** As atualizações do `tdc` são portadas para dentro dele, frente a frente, cada uma em seu próprio PR.

## Alternativas consideradas

- **`tdc`-web como base, reaplicando os canais dinâmicos por cima.** Herdaria os 87 commits sem esforço de port, e a RFC + 6 ADRs de canais dinâmicos já escritas tornariam a reimplementação guiada, não exploratória. Rejeitada porque descarta ~45 arquivos de trabalho já implementado e verificado — incluindo migration aplicada, cache DB-backed, admin de canais e roteamento `/text/[channelId]` — para reescrevê-los contra um código que também mudou. Troca trabalho feito por trabalho a fazer.

- **Divisão por camada: backend do OpenCall, interface do `tdc`.** Rejeitada porque a fronteira não é limpa. A sidebar e o dock são exatamente onde canais dinâmicos e Liquid Glass se cruzam: `VoiceChannelSidebar` consome `useChannels` (OpenCall) e foi deletado e substituído por `liquid-glass/ChannelsSidebar` (`tdc`). Não há como pegar um lado de cada.

## Consequências

- Todo port a partir do commit `890b2b9` (208 arquivos, +15.270/−2.992) é manual: ele mistura Liquid Glass, desktop v1, `SettingsDialog` e `lib/profile/**` num único commit, e deleta os arquivos que o OpenCall usa hoje. Não existe cherry-pick.
- O que o `tdc` construiu em cima do Liquid Glass precisa ser desacoplado dele na cópia. Para o chat isso é trivial (4 imports); para o `SettingsDialog`, custa três das sete abas (ver ADR-0008 e §5.1 da RFC).
- Os canais dinâmicos — o diferencial do OpenCall em relação ao `tdc` — sobrevivem intactos.
- O `tdc` continua sendo o repositório privado com LoL, changelog e o resto; esta migração não cria via de mão dupla nem processo recorrente de upstream.
