# ADR-0002: Fase 1 cobre canais de voz **e** de texto dinâmicos

**Status**: Aceito
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

O chat de texto hoje é uma constante (`TEXT_CHANNEL_ID = 'global'`) referenciada por valor fixo em ~15 pontos das 3 rotas de chat (`api/chat/messages`, `messages/clear`, `read`). Tornar texto multi-canal exige parametrizar essas rotas por `channelId`, decidir a forma de URL/página (`/text/[channelId]`), e confirmar que a leitura de "não lida" por canal (`TextChannelRead`, já com `channelId` na PK composta) funciona sem mudança de schema — só de uso.

A alternativa original considerada (ver histórico da RFC) era entregar só voz na Fase 1, por essa superfície de chat ser mais espalhada que a de voz. Essa alternativa foi descartada.

## Decisão

Fase 1 entrega **canais de voz e de texto dinâmicos juntos**, os dois com CRUD completo na mesma aba de admin ("Canais"), usando a tabela unificada `Channel` (ADR-0001) com `type: VOICE | TEXT`.

Isso implica:

- As 3 rotas de chat passam a aceitar `channelId` explícito (ver [ADR-0006](./0006-chat-api-channelid-explicito.md)) em vez da constante `TEXT_CHANNEL_ID`.
- A sidebar ganha uma lista de canais de texto (hoje é um único `<BatePapoLink/>` fixo), no mesmo padrão visual da lista de voz.
- Rotas de página: `/text` vira alias do canal de texto padrão (primeiro por `sortIndex`, mesmo padrão de `DEFAULT_CHANNEL_ID` pra voz) e `/text/[channelId]` abre um canal específico.
- O canal `global` existente vira a *seed* do primeiro canal de texto (mesmo id, pra não perder histórico de `TextMessage`/`TextChannelRead`).

## Alternativas consideradas

- **Só voz na Fase 1, texto em RFC separada depois**: era a proposta original — menor escopo, menor risco de migração de uma vez só. Descartada porque o produto já sabe que quer os dois agora; adiar geraria uma segunda rodada de migração e de revisão de PR desnecessária.

## Consequências

- Escopo de implementação maior: além das 9 rotas de RTC (voz), agora as 3 rotas de chat também mudam de assinatura — mais superfície de teste manual antes de shippar.
- `useChatUnread` (contagem de não lidas) precisa virar por canal, não mais um contador único global.
- Ganho: uma única migração/rollout entrega o recurso completo, sem deixar o chat "para trás" como uma dívida técnica conhecida.
