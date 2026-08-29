# ADR-0003: Remover canal é soft-delete (`archivedAt`), não `DELETE` de linha

**Status**: Proposto
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

`VoiceChannelAlert.channelId` e, com texto multi-canal também na Fase 1 (ADR-0002), `TextMessage.channelId`/`TextChannelRead.channelId` referenciam o id do canal. Apagar a linha de `Channel` de verdade força uma escolha ruim em qualquer FK real: `CASCADE` apaga histórico (mensagens de um canal de texto que existiu), `RESTRICT` bloqueia a exclusão sempre que houver qualquer histórico associado — o que, na prática, impediria apagar quase qualquer canal já usado.

## Decisão

`DELETE /api/admin/channels/[channelId]` não remove a linha — seta `archivedAt = now()`. Um canal arquivado:

- some da lista usada pela sidebar e por `CHANNEL_LIST`/`getChannel` no fluxo de join (não é possível entrar nem ver na lista);
- **não** desconecta quem já está conectado na sala no momento do arquivamento — arquivar tira da lista pra gente nova, não é um kick (ver §6 "Riscos" da RFC);
- continua existindo pra qualquer histórico associado (`VoiceChannelAlert`, `TextMessage`) não perder a referência.

Reativar (`archivedAt = null`) é uma operação normal de update, exposta na UI de admin (não uma recuperação especial).

## Alternativas consideradas

- **Hard delete com `onDelete: Cascade`**: rejeitada — apaga histórico de texto do canal sem aviso, e não há como desfazer.
- **Hard delete com `onDelete: Restrict`**: rejeitada — na prática travaria a exclusão de qualquer canal que já teve uma mensagem ou um alerta do Discord, tornando o botão "excluir" inútil pro caso comum.

## Consequências

- A tabela `Channel` cresce indefinidamente (canais arquivados nunca são fisicamente removidos). Aceitável — o volume esperado é baixo (dezenas, não milhares).
- Toda query de listagem (sidebar, `CHANNEL_LIST`) precisa lembrar de filtrar `archivedAt: null`; a UI de admin é a exceção (mostra arquivados também, pra permitir reativar).
- Um hard-delete de verdade (para conformidade/GDPR-like ou limpeza manual) fica como operação manual via banco, fora do escopo desta feature — não é exposto na UI.
