# RFC: Migração das atualizações do TDC para o OpenCall

**Status**: Executada — as quatro frentes de §5 estão em `feat/migracao-tdc` (commits 3b667c4, f3d8667, 23bf74c, 976809a, 821b554). O §9 abaixo é o plano original; o que a execução mudou está anotado em cada frente.
**Decisões relacionadas**: [ADR-0007](./adr/0007-opencall-e-a-base-da-migracao.md) (Aceita), [ADR-0008](./adr/0008-liquid-glass-fica-no-opencall-plus.md) (Aceita), [ADR-0009](./adr/0009-noise-gate-proprio-substitui-krisp.md) (Aceita), [ADR-0010](./adr/0010-opencall-plus-e-repo-separado.md) (Aceita)

## 1. Contexto

O OpenCall nasceu de uma extração do módulo `channels` do repositório privado `tdc`, executada em 2026-08-22 e commitada em 2026-08-29 (`90c41a8`). O plano dessa extração está documentado do lado do `tdc`, em `docs/opencall/`.

Depois disso os dois repositórios andaram **em paralelo, em direções diferentes**:

- **`tdc`** acumulou 87 commits entre 2026-08-22 e 2026-09-01, quase todos em `channels`: um app desktop Electron completo, o tema Liquid Glass em toda a interface, soundboard, noise gate próprio, GIF/YouTube/emoji no chat, máscara de perfil, e uma reescrita da qualidade de transmissão.
- **`opencall`** implementou os **canais dinâmicos** (a RFC [rfc-dynamic-channels](./rfc-dynamic-channels.md) e as ADRs 0001–0006), além de docker-compose para desenvolvimento local, documentação de deploy e bootstrap do primeiro admin.

O resultado é uma divergência **bidirecional**: não existe fast-forward possível em nenhuma das duas direções.

## 2. Objetivo

Trazer para o OpenCall as evoluções do `tdc` que pertencem ao **produto web**, preservando integralmente o trabalho de canais dinâmicos já feito no OpenCall, e separando explicitamente o que pertence ao **OpenCall+** (o shell Electron, em repositório próprio — ADR-0010).

## 3. Não-objetivo

- **Responsividade mobile.** É do OpenCall web (não do OpenCall+), mas não desta rodada: o `tdc` não tem esse trabalho feito — `docs/briefing-app-mobile.md` (2026-09-01) é estudo de viabilidade, não implementação. Adaptar uma interface que ainda está mudando é trabalho jogado fora.
- **Paridade visual com o `tdc`.** O Liquid Glass fica no OpenCall+ (ADR-0008). O OpenCall mantém o design atual.
- **Soundboard** e **qualidade de transmissão derivada da origem (RFC-012 do `tdc`)**. Fora de escopo por decisão de produto — ver §7.
- **Sincronização contínua entre os repos.** Esta RFC cobre uma rodada de migração, não um processo recorrente de upstream.

## 4. Achados do levantamento

### 4.1 Tamanho da divergência

Comparação de `src/` por hash de conteúdo:

| | Arquivos |
|---|---|
| `tdc/src` | 515 |
| `opencall/src` | 255 |
| Idênticos nos dois | 82 |
| Compartilhados mas divergentes | **128** |
| Só no `tdc` | 305 — sendo ~167 relevantes a `channels` e 138 de LoL/changelog |
| Só no `opencall` | 45 |

Os arquivos centrais já não admitem merge textual:

```
providers/VoiceProvider.tsx              1586 → 2729 linhas   (1399 linhas de diff)
components/VoiceDock/VoiceChannelStage.tsx  832 → 1153        (1001)
app/globals.css                           125 →  731          ( 606)
lib/rtc/streamQuality.ts                  137 →  330          ( 409)
components/PlatformUsersSidebar/index.tsx 344 →  512          ( 264)
layouts/SectionsSidebar/index.tsx         301 →  427          ( 246)
```

### 4.2 Conflitos diretos (escolha, não merge)

| Área | OpenCall | `tdc` |
|---|---|---|
| Canais | **dinâmicos** (tabela `Channel`) | estáticos (`CHANNELS = {geral, primos}`, `TEXT_CHANNEL_ID = 'global'`) |
| Dock e sidebar | `VoiceDock/index.tsx` + `VoiceChannelSidebar.tsx` | **deletados** → `liquid-glass/FloatingDock` + `ChannelsSidebar` |
| Supressão de ruído | `@livekit/krisp-noise-filter` | **removido** → noise gate próprio |
| Pareamento de dispositivo | `/api/auth/qr` | `/api/auth/pairing` (RFC-011 do `tdc`) |

### 4.3 O commit monolítico

`890b2b9` ("app desktop v1 e tema liquid glass em todo o app") tem **208 arquivos, +15.270/−2.992**. Ele mistura, num único commit:

- o tema Liquid Glass (`styles/theme.css` 1035L, `styles/liquid-glass.css` 1021L, `grainient`);
- o app desktop v1 (`/download`, `lib/desktop/downloads.ts`, `useDesktopUpdate`, `lib/auth/devicePairing.ts`);
- o `SettingsDialog` inteiro e o `lib/profile/**` (máscara de perfil);
- a **deleção** de `VoiceDock/index.tsx`, `SelfControlCard.tsx`, `AudioDeviceSelects.tsx` e `LoginQrModal.tsx` — exatamente os arquivos que o OpenCall usa hoje.

Não existe cherry-pick para nada que nasceu nesse commit. Todo port a partir dele é manual e seletivo.

### 4.4 Acoplamentos que atravessam as frentes

- **`lib/profile/identity.ts` é importado por 14 arquivos** — `lib/chat/dto.ts`, `api/presence/users`, `api/user/types`, `api/admin/users/types`, `InviteToChannelsModal`, `AdminUsersView`, entre outros. A máscara de perfil não é uma aba de configurações: é uma **camada de identidade resolvida na leitura**, que atravessa todo lugar onde um nome ou avatar é renderizado. Por isso ela vem primeiro (§5.1).
- **`lib/chat/dto.ts` é um merge a três vias**: o OpenCall adicionou `channelId` (canais dinâmicos), o `tdc` adicionou `replyExcerpt` (chat rico) *e* `channelsIdentity`/`PROFILE_MASK_SELECT` (máscara de perfil), no mesmo arquivo.
- **O noise gate veio junto com o push-to-talk** no commit `ff466d1`, e os dois entram no `VoiceProvider`. O PTT é desktop-only por design (`isPushToTalkSupported()` retorna `false` no browser, porque o listener morre quando a aba perde foco). Portar o gate exige separá-los.
- **`MicSettingsFields.tsx` (534L) carrega o bloco de PTT** e é importado pelo `AudioVideoTab`. As frentes A e C dependem do mesmo trim.
- **O acoplamento do chat com o Liquid Glass é trivial**: 4 arquivos, um import cada (`ui/popover-liquid-glass` → `ui/popover`). `messageContent.tsx` e o `EmojiPicker` estão limpos — o emoji picker apenas *coincidiu* no commit do soundboard (`3a49883`), não depende dele.

### 4.5 Estado do working tree do OpenCall

73 arquivos não commitados. Os canais dinâmicos estão funcionalmente completos (migration `20260901185925_dynamic_channels` aplicada, `lib/rtc/channels.ts` DB-backed com cache, `useChannels` plugado na sidebar e no dock, admin de canais, `/text/[channelId]`), mas nada disso está em commit.

**Pré-requisito da migração**: commitar os canais dinâmicos antes de qualquer port. Sem isso, cada frente mistura código novo com WIP não revisado, e um `git diff` deixa de significar alguma coisa.

## 5. Escopo — o que migra

Quatro frentes, na ordem em que devem ser executadas. A ordem é imposta pelos acoplamentos de §4.4, não por prioridade de produto.

### 5.1 Frente A — Máscara de perfil e `SettingsDialog` reduzido

Vem primeiro porque é a camada de identidade que o chat (frente B) já assume.

**Migration** — três colunas em `User`:

```prisma
displayName       String?  @map("display_name")
displayAvatar     String?  @map("display_avatar")   // key do R2, nunca URL
useDiscordProfile Boolean  @default(true) @map("use_discord_profile")
```

Não migram: `theme` (Liquid Glass → OpenCall+), `pinkMode`/`darkMode` (pranks → §7).

**Arquivos novos**

```
lib/profile/{animatedImage,avatarStorage,identity,propagate,query}.ts
lib/r2/publicUrl.ts
components/SettingsDialog/{index,ProfileTab,ProfileAvatarCropper,AudioVideoTab,AccountLinkTab}.tsx
components/ProfileModerationDialog/index.tsx
hooks/{useProfileBroadcast,useSelfIdentity}.ts
app/api/user/profile/route.ts
app/api/admin/users/[userId]/profile/route.ts
```

**Arquivos editados**: `api/user/{types,queries,route}.ts`, `api/admin/users/types.ts`, `api/presence/users/route.ts`, `components/Avatar`, `InviteToChannelsModal`, `flows/admin/users/AdminUsersView`.

**Trims obrigatórios**

- `AudioVideoTab` importa `MicSettingsFields` — remover o bloco de push-to-talk (volta na frente C, sem o PTT).
- `AccountLinkTab` usa `DevicePairingPanel` (`/api/auth/pairing`) — adaptar para o `/api/auth/qr` que o OpenCall já tem.
- `AdminTab` embute o `AdminTabsView` dentro do diálogo — **não migra**: o OpenCall já expõe `/admin` como página, e duplicar a superfície de admin em dois lugares dobra o custo de toda mudança futura.
- `SettingsDialog/index.tsx` importa `ui/dialog` — usar o do OpenCall, não o do `tdc` (que é Liquid Glass).

**Abas resultantes**: Perfil, Áudio/Vídeo, Conta. As outras quatro do `tdc` (Layout, Efeitos sonoros, Admin, Informações técnicas) ficam de fora — Layout é o seletor de material do Liquid Glass, Efeitos sonoros é 4/6 soundboard, Informações técnicas tem 8 referências a `window.tdcall`, Admin duplica `/admin`.

**Origem**: `890b2b9` (monolítico) + `f6346ba`, `a3b2d54`, `1c0ef7c`. Port manual.

### 5.2 Frente B — Chat rico (GIF, YouTube, emoji, citação)

**Arquivos novos**

```
lib/chat/{gifUrl,giphy,youtubeUrl,replyExcerpt}.ts
flows/channel/text/messageContent.tsx     (331L — renderer compartilhado de GIF e YouTube)
flows/channel/text/GifPickerPopover.tsx   (179L)
components/EmojiPicker/EmojiPickerPopover.tsx
app/api/chat/giphy/route.ts
app/api/chat/youtube-oembed/route.ts
```

**Arquivos editados**: `MessageComposer` (+42), `MessageItem` (149 linhas reescritas para usar `messageContent`), `ImageLightbox` (+30), `lib/chat/channel.ts`, `lib/chat/dto.ts`.

**Merges manuais**

- `lib/chat/channel.ts` — o OpenCall removeu `TEXT_CHANNEL_ID` (canais dinâmicos); o `tdc` acrescentou `GIPHY_SEARCH_RATE_LIMIT` e `YOUTUBE_OEMBED_RATE_LIMIT`. Merge limpo: só somar as duas constantes.
- `lib/chat/dto.ts` — merge a três vias (§4.4). Preservar `channelId` do OpenCall, trazer `replyExcerpt` desta frente e `channelsIdentity`/`PROFILE_MASK_SELECT` da frente A.

**Dependências novas**: `@giphy/js-fetch-api`, `emoji-mart`, `@emoji-mart/data`, `@emoji-mart/react`.

**Variável de ambiente nova**: chave da API do GIPHY. Precisa entrar em `.env.example`, `.env.docker.example` e na documentação de deploy — é a primeira env var opcional-mas-visível que quem self-hospeda vai encontrar. Se ela faltar, o picker de GIF deve degradar (some da UI), não quebrar o compositor.

**Ajuste de Liquid Glass**: quatro imports de `ui/popover-liquid-glass` → `ui/popover` (`MessageComposer`, `MessageItem`, `GifPickerPopover`, `EmojiPickerPopover`).

**Origem**: `83d3b3e` (GIPHY + citação), `6b3dca0` (YouTube), `3a49883` (só o `EmojiPicker`).

### 5.3 Frente C — Noise gate próprio (substitui o Krisp)

Ver ADR-0009 para a decisão.

**Sai**: `components/VoiceDock/KrispLogo.tsx`, `components/VoiceDock/NoiseSuppressionPopover.tsx`, dependência `@livekit/krisp-noise-filter`.

**Entra**: `lib/rtc/noiseSuppression.ts` (reescrito, +256), `components/VoiceDock/MicSettingsFields.tsx` (534L), `MicSettingsPopover.tsx`, `MicrophoneDeviceSelect.tsx`, `AudioOutputSelect.tsx`, `hooks/useAudioInputDevices.ts`; edições em `AudioWaveform`, `SelfControlCard`, `MobileStreamView`.

**Toca `VoiceProvider.tsx`** (+155 linhas no commit original), que é o arquivo de maior divergência do repositório. Port cirúrgico, não substituição de arquivo.

**Separação obrigatória**: `ff466d1` traz `hooks/usePushToTalkHeld.ts` e `lib/rtc/pushToTalk.ts` no mesmo commit. Ambos vão para o OpenCall+ — não migram aqui, e o `MicSettingsFields` precisa perder o bloco correspondente (o mesmo trim da frente A).

### 5.4 Frente D — Correções web

| Correção | Custo | Origem |
|---|---|---|
| Volume 0 de live e de participante volta a valer depois de reanexar | `VoiceProvider` +8 linhas **e um patch do `livekit-client@2.22.0`** (`pnpm patch`) | `ae4387a` |
| Clicar no vídeo esconde a UI sobreposta em tela cheia | `hooks/useStageOverlayToggle.ts` (67L) + `VoiceChannelStage` + `MobileStreamView` | `f0a9080` |
| Áudio do sistema na live não leva a voz do canal junto | `VoiceProvider` +59 linhas (`supportsRestrictOwnAudio`, `leaksOwnAudio`, `dropUnfilteredSystemAudio`) | `7356c7f` |

O patch do `livekit-client` merece uma nota no README: um repositório self-hosted que aplica patch em dependência precisa deixar isso explícito, senão quem faz fork descobre do jeito difícil.

**A terceira correção entra inteira no web** (pergunta 2 de §10, resolvida). O eco não é um problema exclusivo do Electron: `getDisplayMedia` com áudio do sistema no navegador captura o mix de saída inteiro, e a aba tocando a voz do canal está dentro dele. A defesa é a mesma nos dois lados — só vai ao ar o áudio que provar que foi filtrado, senão a track de áudio é despublicada (o vídeo continua no ar) com aviso ao usuário.

Dois ajustes na cópia:

- `dropUnfilteredSystemAudio` passa `Boolean(window.tdcall)` como `inDesktopShell`. Sem shell, é sempre `false` — o parâmetro sai, e o teste vira só `settings.restrictOwnAudio === true || deviceId === 'loopbackWithoutChrome'` contra `deviceId.startsWith('loopback')`.
- O texto do toast (*"Atualize o app pra transmitir com som"*) é do OpenCall+. No web a causa é outra — o navegador não suporta a constraint `restrictOwnAudio` (Chrome/Edge 140+) — e o texto precisa dizer isso.

## 6. O que fica no OpenCall+

Repositório separado, consumindo o deploy do OpenCall (ADR-0010).

- Todo o `desktop/` do `tdc`: `main.js`, `preload.js`, `tray.js`, `updater.js`, `splash.js`, `picker.js`, `windowChrome.js`, `hook-uiohook`/`hook-keyserver`/`hook-worker`, `badge.js`, `permission.js`
- **Tema Liquid Glass completo** — `styles/theme.css`, `styles/liquid-glass.css`, `grainient`, todos os primitivos `ui/*` reescritos, `surface.tsx`, `popover-liquid-glass.tsx`, `ThemeProvider`, `MotionProvider`, `liquid-glass/FloatingDock`, `liquid-glass/ChannelsSidebar`, `SidebarUserCard`, `ParticipantTileLiquidGlass`, coluna `theme` no `User`, `SettingsDialog/LayoutTab` + `ThemePreviewCard`
- Push-to-talk global (`lib/rtc/pushToTalk.ts`, `usePushToTalkHeld`, `usePushToTalkHookBlocked`, `usePushToTalkSupported`)
- Badge do ícone do app (menção, live, gente na voz), bandeja
- Auto-update macOS/Windows, `/api/version`, `/api/version/events`, `/api/download/[platform]`, página `/download`, `UpdateAvailableToast`, `useDesktopUpdate`
- Chrome de janela: arraste pelo topo, botões por lado do sistema, material passthrough
- Zoom da interface (`UIZoomProvider`, `UIZoomSlider`)
- `SettingsDialog/TechnicalInfoTab`
- Seletor de janela/monitor com captura de áudio do sistema

## 7. O que não vai para lugar nenhum

- **Soundboard completo** — 2 models Prisma (`SoundboardClip`, `SoundboardRevision`), 4 rotas, storage no R2, editor de waveform, ~14 arquivos. Cortado por decisão de produto; fica registrado aqui caso volte.
- **Qualidade de transmissão derivada da origem** (RFC-012 do `tdc`) — `captureScaling`, `captureHealth`, reconciliação de escala de publicação, preset 1440p60/15Mbps, VP8 na câmera, beacon de relato contínuo. `streamQuality.ts` cresceu de 137 para 330 linhas nessa frente.
- **Pranks de modo escuro e modo rosa** — conteúdo interno da comunidade do `tdc`, não faz sentido num produto self-hosted genérico.

## 8. Riscos

- **`VoiceProvider.tsx` é o gargalo.** Duas frentes (C e D) fazem cirurgia num arquivo com 1399 linhas de divergência. É onde uma regressão silenciosa é mais provável e mais difícil de atribuir. Vale teste manual de voz — entrar, sair, trocar de microfone, mutar, ensurdecer, reanexar áudio — ao fim de cada uma.
- **A máscara de perfil reescreve o histórico na leitura.** `channelsIdentity` é resolvida a cada leitura, então trocar de apelido muda o nome em todas as mensagens antigas, inclusive nas citações. Confirmado como o comportamento desejado também no OpenCall (pergunta 1 de §10, resolvida) — o alternativo seria congelar nome e avatar em cada linha de `TextMessage`, que é copiar identidade por mensagem justamente para evitar o join por id. Fica aqui como risco de *percepção*, não de implementação: quem renomear vai ver o histórico inteiro mudar, e isso precisa estar claro na interface de Perfil.
- **A chave do GIPHY é a primeira env var de terceiro no OpenCall.** Precisa degradar bem quando ausente, senão vira requisito de fato para instalar o projeto.
- **O port a partir do `890b2b9` não tem rede de proteção.** Sem cherry-pick possível, o que garante a paridade é revisão arquivo a arquivo — não o Git.
- **Frentes A e B tocam o mesmo `dto.ts`.** Fazer as duas em paralelo garante conflito. A ordem de §5 existe por isso.

## 9. Plano de rollout

0. ~~**Commitar os canais dinâmicos**~~ — feito em `ba86b50` (126 arquivos), junto com convites por link, pareamento de dispositivo e o docker-compose que também estavam soltos no working tree.
1. ~~**Frente A**~~ — feita. O `SettingsDialog` saiu com **duas** abas, não três: Áudio e vídeo foi junto com a frente C, que é quem traz os campos que a justificam.
2. ~~**Frente B**~~ — feita. A dependência do `channelsIdentity` no `dto.ts` se confirmou: as duas frentes tocam o mesmo arquivo, e fazê-las em ordem evitou o conflito.
3. ~~**Frente C**~~ — feita. O `MicSettingsFields` (534L) do `tdc` **não** foi portado: está entrelaçado com push to talk em cinco pontos, e adaptar o popover que o OpenCall já tinha custou menos e arriscou menos. Áudio e vídeo virou aba aqui.
4. ~~**Frente D**~~ — feita. A correção do áudio de sistema trouxe junto o `windowAudio`, que precisa do mesmo patch do `livekit-client` — os dois hunks entraram no mesmo arquivo de patch.
5. ~~**Passe de branding**~~ — feito junto da frente D.

Cada frente é um PR próprio. As frentes A e B não podem ser paralelizadas (§8).

## 10. Perguntas resolvidas nesta rodada

1. ~~A máscara de perfil reescrevendo o histórico na leitura é o comportamento desejado no OpenCall, ou o nome deveria ser congelado por mensagem?~~ → **Resolvida na leitura, igual ao `tdc`.** Trocar de apelido reescreve o histórico inteiro, inclusive as citações (ver §8).
2. ~~A correção do áudio de sistema vale sozinha no web, sem o picker do Electron?~~ → **Vale, e entra inteira.** O eco existe no navegador também; a guarda é a mesma, com dois ajustes de cópia (ver §5.4).

## 11. Perguntas em aberto

1. O `AccountLinkTab` deve substituir o fluxo de QR atual do OpenCall ou conviver com ele? Decisão adiável até a frente A chegar na aba Conta — as duas leituras dão o mesmo trabalho até ali.
