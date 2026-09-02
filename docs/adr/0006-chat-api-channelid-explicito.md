# ADR-0006: Rotas de chat recebem `channelId` explícito, sem reestruturar a URL

**Status**: Proposto
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

Com texto multi-canal entrando no escopo (ADR-0002), as 3 rotas de chat (`api/chat/messages`, `messages/clear`, `read`) deixam de poder usar a constante `TEXT_CHANNEL_ID = 'global'` e precisam saber de qual canal se trata. Duas formas de expor isso na API:

1. Continuar nas mesmas URLs (`/api/chat/messages`, etc.), recebendo `channelId` como query param (GET) ou campo do corpo (POST/PATCH/DELETE).
2. Reestruturar pra URLs aninhadas por canal (`/api/chat/[channelId]/messages`, `/api/chat/[channelId]/read`, etc.), no padrão mais "RESTful".

## Decisão

Opção 1 — `channelId` como parâmetro explícito (query string em GET, campo no corpo em mutações), mantendo a forma de URL atual das 3 rotas.

## Alternativas consideradas

- **URLs aninhadas por canal**: mais alinhado a convenção REST e mais fácil de ler em log de acesso. Rejeitada por ora porque exigiria também mudar `src/app/api/chat/uploads`, `typing`, `events`, `block` (que hoje não têm noção de canal) caso algum deles precise ganhar essa dimensão no futuro, além de forçar uma reescrita maior dos hooks de client (`useChatMessages`, `useChatUnread`, etc.) que hoje montam a URL sem esse segmento. O ganho de "RESTfulness" não paga o tamanho do diff nesta entrega.

## Consequências

- Toda rota precisa validar explicitamente que o `channelId` recebido existe e é do tipo `TEXT` — antes essa checagem nem existia (a constante garantia isso implicitamente). Essa validação usa a mesma leitura cacheada de canal do ADR-0004.
- Se no futuro a API de chat crescer o suficiente pra justificar nesting por canal (ex.: uploads/typing/events realmente precisarem disso), essa é uma migração de rota localizada, não um redesenho de schema.
