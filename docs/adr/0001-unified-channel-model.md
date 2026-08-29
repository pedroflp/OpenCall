# ADR-0001: Tabela `Channel` unificada com discriminador `type`

**Status**: Proposto
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

Ao tornar canais dinâmicos, é preciso decidir se voz e texto viram uma tabela só (`Channel` com `type: VOICE | TEXT`) ou duas tabelas separadas (`VoiceChannel`, `TextChannel`), cada uma só com os campos que faz sentido pro seu tipo (ex.: `maxParticipants` não existe pra texto).

## Decisão

Uma tabela única `Channel`, com um enum `type` como discriminador. Campos que só fazem sentido pra um tipo (`maxParticipants`) ficam opcionais (`Int?`).

## Alternativas consideradas

- **Duas tabelas (`VoiceChannel`/`TextChannel`)**: mais "correta" no sentido de cada linha só ter campos válidos pro seu domínio, sem `null`s condicionais. Rejeitada porque a sidebar já trata as duas listas de forma quase idêntica (nome, ordenação, seção), e a Fase 1 expõe CRUD completo pros dois tipos na mesma aba de admin (ver ADR-0002) — duas tabelas duplicariam a API/UI de gestão sem ganho real.

## Consequências

- `maxParticipants` fica `Int?` — nulo pra `type: TEXT`. Validação de "obrigatório se voice" fica na camada de API/form, não no schema.
- Se no futuro voz e texto divergirem muito mais (ex.: texto ganhar campos como `topic`, `pinnedMessageId`, e voz ganhar `region`/`codec` por canal), a tabela única cresce com colunas majoritariamente nulas pra um dos tipos. Se isso acontecer, migrar pra duas tabelas nesse ponto é uma refatoração localizada (a FK em `TextMessage.channelId` continua valendo pro `id` da linha, independente de qual tabela ele vier a ocupar).
- Uma query (`findMany({ where: { type } })`) já serve os dois casos, evitando duplicar a lógica de cache (ADR-0004) e de ordenação.
