# ADR-0004: Cache de leitura de canais no Upstash Redis, TTL curto

**Status**: Proposto
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

`getChannel`/`CHANNEL_LIST` hoje são leitura de objeto em memória — custo zero. Virando query no Postgres (ver ADR-0001), essa leitura passa a acontecer em **9 rotas de API de voz** de alta frequência (`join`, `kick`, `config`, `stop-camera`, `stop-stream`, `mute`, `unwatch`, `call`, `leave`), em `applyPresenceWebhook` (chamada a cada evento do LiveKit — entra/sai participante, publica/despublica track, potencialmente várias vezes por segundo numa sala ativa), e agora também nas **3 rotas de chat** (`messages`, `messages/clear`, `read`), que passam a validar `channelId` a cada request (ADR-0006) — texto costuma ter volume de chamada ainda maior que voz (toda mensagem enviada/lida bate nessas rotas).

## Decisão

Cachear a leitura de canais no Upstash Redis (já usado no projeto — ver padrão de `redisKeys`/TTL nomeado em outras features) com TTL curto (segundos, não minutos — ex.: 5-10s). Toda escrita (`POST`/`PATCH`/arquivar em `/api/admin/channels`) invalida a chave explicitamente, em vez de depender só do TTL expirar.

## Alternativas consideradas

- **Sem cache, query direta a cada chamada**: mais simples, mas multiplica a carga no Postgres pelo volume de eventos do LiveKit — rejeitada por ser a rota mais quente do sistema (webhook de presence já é comentado no código como caminho crítico).
- **Cache in-memory por processo (module-level `Map`, como o objeto estático de hoje)**: mais rápido que Redis, mas não invalida entre instâncias/deploys (o app roda em Railway, potencialmente múltiplas réplicas) — um admin criando um canal numa réplica não apareceria nas outras até reiniciar. Rejeitada pela mesma razão que o resto do projeto já usa Redis compartilhado em vez de estado local.
- **TTL longo (minutos) sem invalidação explícita**: mais simples de implementar, mas um canal recém-criado ou arquivado ficaria inconsistente por minutos — pior experiência pro admin que acabou de criar o canal e não vê refletir.

## Consequências

- Toda rota de admin que cria/edita/arquiva um canal precisa lembrar de invalidar a chave de cache — se esquecida em algum ponto novo no futuro, o sintoma é "criei o canal mas não aparece por alguns segundos", não um bug de dados incorretos (o TTL curto limita o dano).
- Uma dependência a mais (Redis) no caminho crítico do join de voz — já existente no projeto para outras features, então não é uma dependência nova, só um uso a mais dela.
