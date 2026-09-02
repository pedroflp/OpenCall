# ADR-0003: Remover canal é soft-delete (`archivedAt`), não `DELETE` de linha

**Status**: Revogada — ver "Atualização" abaixo. `DELETE /api/admin/channels/[channelId]` faz hard-delete de verdade.
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

## Atualização (pedido de produto, pós-implementação)

Decisão revertida: o produto pediu explicitamente um hard-delete exposto na UI pra canais de voz e de texto, em vez de só arquivar. `DELETE /api/admin/channels/[channelId]` agora remove a linha de `Channel` de verdade (`prisma.channel.delete`), dentro de uma transação que também limpa `VoiceChannelAlert` (sem FK pro canal, então não cascade automático).

O trade-off original entre `CASCADE` (perde histórico sem aviso) e `RESTRICT` (trava o delete na prática) foi resolvido assim: `TextMessage.channel`/`TextChannelRead.channel` viraram `onDelete: Cascade`, mas a **UI força um double confirm antes de chamar a rota** — o diálogo mostra a contagem de mensagens que seriam apagadas (`messageCount`, calculado em `listAdminChannels`) e exige digitar o nome exato do canal pra habilitar o botão. Isso troca a proteção que estava no banco (impedir a perda de dados) por uma proteção na UI (garantir que o admin viu o tamanho do estrago antes de confirmar) — aceitável porque a ação só é alcançável por `isCurrentUserChannelsAdmin`.

O campo `archivedAt` foi removido do schema — não existe mais estado "arquivado"; reativar também deixou de existir. O risco de canal de voz excluído com gente conectada (não desconecta, só impede entrada de gente nova) continua o mesmo descrito acima — só que agora é permanente, não reversível reativando o canal.
