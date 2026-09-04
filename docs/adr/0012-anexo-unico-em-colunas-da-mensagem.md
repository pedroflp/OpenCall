# ADR-0012: Um anexo por mensagem, em colunas da própria linha

**Status**: Aceita
**RFC relacionada**: [rfc-anexos-de-arquivo](../rfc-anexos-de-arquivo.md)

## Contexto

`TextMessage` guarda o anexo em quatro colunas inline (`image_key`,
`image_width`, `image_height`, `image_bytes`). Generalizar "imagem" pra "arquivo
qualquer" abre a pergunta de aproveitar a mudança pra suportar **vários** anexos
por mensagem, o que exigiria tabela filha (`MessageAttachment`).

## Decisão

Continua **um anexo por mensagem**, agora em colunas `attachment_*` na própria
linha — as quatro existentes renomeadas, mais `attachment_kind`,
`attachment_mime`, `attachment_name` e `attachment_duration_ms`.

## Alternativas consideradas

- **Tabela filha `MessageAttachment` desde já** (mesmo que a UI só permita um):
  deixaria a porta aberta pra múltiplos sem outra migração de schema. Rejeitada
  porque o custo não está no schema — está em tudo que hoje assume "zero ou um":
  o compositor (um `PendingAttachment`, um preview, um botão de remover), a
  mensagem otimista, o `upsertFromServer`, a tira de citação, o DTO, a limpeza de
  órfão e o `moveAttachmentToDeleted` de cada rota de exclusão. Trocar o schema
  sem trocar nada disso seria pagar o join e a complexidade sem entregar a
  feature; trocar tudo junto é outra entrega, com decisões próprias de UI (grade
  de imagens? ordem? limite por mensagem?).
- **Colunas novas convivendo com as de imagem**: duas representações do mesmo
  fato, e toda leitura teria que decidir qual vale. Renomear é uma migration de
  metadata (instantânea no Postgres, sem reescrever tabela) e deixa uma
  representação só.

## Consequências

- A migration renomeia colunas em vez de criar novas: histórico inteiro
  preservado, backfill só de `attachment_kind = 'IMAGE'` e do mime derivado da
  extensão da chave.
- `attachment_name` fica nulo nas linhas antigas — o nome original nunca esteve
  no Postgres, só na metadata do objeto no R2. A UI cai no nome derivado da
  chave.
- Suportar vários anexos depois é uma migração localizada (linhas viram tabela
  filha), com o custo real onde ele sempre esteve: na UI.
