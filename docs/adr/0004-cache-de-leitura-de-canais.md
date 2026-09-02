# ADR-0004: Cache de leitura de canais em memória, TTL curto

**Status**: Aceito (revisada na implementação — ver "Atualização" abaixo)
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

`getChannel`/`CHANNEL_LIST` hoje são leitura de objeto em memória — custo zero. Virando query no Postgres (ver ADR-0001), essa leitura passa a acontecer em **9 rotas de API de voz** de alta frequência (`join`, `kick`, `config`, `stop-camera`, `stop-stream`, `mute`, `unwatch`, `call`, `leave`), em `applyPresenceWebhook` (chamada a cada evento do LiveKit — entra/sai participante, publica/despublica track, potencialmente várias vezes por segundo numa sala ativa), e agora também nas **3 rotas de chat** (`messages`, `messages/clear`, `read`), que passam a validar `channelId` a cada request (ADR-0006) — texto costuma ter volume de chamada ainda maior que voz (toda mensagem enviada/lida bate nessas rotas).

## Decisão

Cachear a leitura de canais em memória do processo (module-level, `globalThis`, mesmo padrão já usado por `channelsConfig.ts`, `rateLimit.ts` e `callCooldown.ts`), com TTL curto (5s) e invalidação explícita em toda escrita (`POST`/`PATCH`/arquivar em `/api/admin/channels`), em vez de depender só do TTL expirar.

## Atualização (na implementação)

A versão original desta ADR propunha Upstash Redis, citando "já usado no projeto". Isso estava **errado**: o projeto não tem nenhuma dependência de Redis (não está no `package.json`, não há client em lugar nenhum do código) — ele roda como processo único no Railway, e todo cache equivalente existente (`channelsConfig.ts` pro kill switch/qualidade de stream, `rateLimit.ts`, `callCooldown.ts`, `qrPairing.ts`) já usa `Map`/objeto em `globalThis`, com o comentário explícito "sem Redis" em pelo menos dois desses arquivos. A decisão final seguiu o padrão real do resto do código em vez da suposição errada da ADR: cache in-memory, igual a `channelsConfig.ts`.

Isso reabre o trade-off descrito abaixo em "múltiplas réplicas" — ver Consequências.

## Alternativas consideradas

- **Sem cache, query direta a cada chamada**: mais simples, mas multiplica a carga no Postgres pelo volume de eventos do LiveKit — rejeitada por ser a rota mais quente do sistema (webhook de presence já é comentado no código como caminho crítico).
- **Upstash Redis**: cache compartilhado entre réplicas, mas exigiria adicionar uma dependência de infra que o projeto não tem hoje (nem para o problema equivalente já resolvido por `channelsConfig.ts`) — rejeitada por inconsistência com o resto da base e por não haver, até hoje, necessidade real de múltiplas réplicas.
- **TTL longo (minutos) sem invalidação explícita**: mais simples de implementar, mas um canal recém-criado ou arquivado ficaria inconsistente por minutos — pior experiência pro admin que acabou de criar o canal e não vê refletir.

## Consequências

- Toda rota de admin que cria/edita/arquiva um canal precisa lembrar de invalidar a chave de cache — se esquecida em algum ponto novo no futuro, o sintoma é "criei o canal mas não aparece por alguns segundos", não um bug de dados incorretos (o TTL curto limita o dano).
- Se a instalação um dia rodar múltiplas réplicas do processo Next.js, uma escrita numa réplica não invalida o cache das outras — elas convergem sozinhas em até `CACHE_TTL_MS` (5s). Mesma limitação que `channelsConfig.ts` já aceita hoje; revisitar (aí sim indo pra Redis) se isso virar um problema real de produto.
