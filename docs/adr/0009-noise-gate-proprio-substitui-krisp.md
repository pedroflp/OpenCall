# ADR-0009: O noise gate próprio do `tdc` substitui o Krisp

**Status**: Aceita
**RFC relacionada**: [rfc-migracao-tdc](../rfc-migracao-tdc.md)

## Contexto

O OpenCall usa `@livekit/krisp-noise-filter` para supressão de ruído, com `NoiseSuppressionPopover.tsx` e `KrispLogo.tsx` na interface. O `tdc` seguiu o caminho oposto no commit `ff466d1`: removeu o Krisp e escreveu um noise gate próprio, reescrevendo `lib/rtc/noiseSuppression.ts` (+256 linhas) e trocando a interface por `MicSettingsPopover` e `MicSettingsFields`.

O OpenCall é um projeto open source destinado a ser self-hospedado por terceiros. O plugin do Krisp é proprietário e tem licença própria da LiveKit — um requisito que quem faz fork herda sem ter escolhido.

## Decisão

**O noise gate próprio substitui o Krisp.** A dependência `@livekit/krisp-noise-filter`, o `KrispLogo.tsx` e o `NoiseSuppressionPopover.tsx` saem do OpenCall.

## Alternativas consideradas

- **Manter o Krisp.** Já funciona no OpenCall e a qualidade de um filtro treinado é superior à de um gate por limiar. Rejeitada por causa da licença proprietária num núcleo open source, e porque manteria os dois repositórios divergentes para sempre nesse ponto — toda mudança futura em áudio no `tdc` chegaria contra um código que o OpenCall não tem.

- **Os dois, com escolha do usuário.** Krisp como padrão e gate próprio como alternativa leve, selecionável em Áudio/Vídeo. Rejeitada pelo custo: dobra a superfície de teste de áudio (o caminho mais frágil do produto) para resolver uma decisão que a licença já resolve.

## Consequências

- `MicSettingsFields.tsx` (534L) e `MicSettingsPopover.tsx` entram, junto com `MicrophoneDeviceSelect`, `AudioOutputSelect` e `useAudioInputDevices`.
- O port toca o `VoiceProvider.tsx` (+155 linhas no commit original), o arquivo de maior divergência entre os repositórios. É cirurgia, não substituição — e é onde uma regressão silenciosa é mais provável.
- **O commit de origem traz push-to-talk junto.** `hooks/usePushToTalkHeld.ts` e `lib/rtc/pushToTalk.ts` vieram no mesmo `ff466d1` e entram no mesmo `VoiceProvider`. O PTT é desktop-only por design — `isPushToTalkSupported()` retorna `false` no navegador, porque o listener morre quando a aba perde foco, que é exatamente o cenário que motiva o recurso. Ele vai para o OpenCall+, e o `MicSettingsFields` precisa perder o bloco correspondente na cópia.
- Quem self-hospeda passa a ter supressão de ruído sem depender de licença de terceiro, com qualidade menor que a do Krisp. É a troca aceita aqui.
