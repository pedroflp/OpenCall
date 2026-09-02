# RFC: Canais dinâmicos (voz e texto)

**Status**: Proposto
**Decisões relacionadas**: [ADR-0001](./adr/0001-unified-channel-model.md) (Proposto), [ADR-0002](./adr/0002-fase-1-inclui-voz-e-texto.md) (Aceito), [ADR-0003](./adr/0003-soft-delete-de-canal.md) (Revogada — hard-delete, ver o ADR), [ADR-0004](./adr/0004-cache-de-leitura-de-canais.md) (Aceito — revisada na implementação, ver o ADR), [ADR-0005](./adr/0005-quem-pode-gerenciar-canais.md) (Aceito), [ADR-0006](./adr/0006-chat-api-channelid-explicito.md) (Proposto)

## 1. Contexto

Hoje os canais são estáticos:

- **Voz**: objeto fixo em `src/lib/rtc/channels.ts` (`CHANNELS = { geral, primos }`). Criar um canal novo é editar código e fazer deploy.
- **Texto**: um único canal global (`TEXT_CHANNEL_ID = 'global'` em `src/lib/chat/channel.ts`), referenciado por valor fixo em ~15 pontos das rotas de chat (`api/chat/messages`, `messages/clear`, `read`). Não existe "canal de texto" como conceito — existe *o* chat.

Isso limita o produto: comunidades que precisam de mais de dois canais de voz, ou de canais de texto por assunto/grupo, não têm como sem alteração de código.

## 2. Objetivo

Permitir que um admin (`isAdmin` ou `channels_admin` — ver **D5**/ADR-0005) **crie, edite e arquive canais de voz e de texto** dinamicamente, sem deploy, com a UI (sidebar, join, chat, presence, alertas do Discord) reagindo automaticamente.

## 3. Não-objetivo

- **Qualidade de stream por canal**: `ChannelsConfig` continua um singleton global — não há pedido de produto pra isso virar por-canal.
- **Permissões granulares por canal** (ex.: canal de texto visível só pra um grupo específico): fora de escopo — todo canal listado é visível pra quem já tem `canalAccess`, igual hoje.
- **Limite de canais simultâneos**: decidido não ter um teto por enquanto (ver §7) — revisita se virar problema real de custo/spam.
- **Reordenação manual (drag-and-drop)**: a ordem é a de criação (`sortIndex` sequencial) — sem UI de reordenar nesta fase (ver §7).

## 4. O que já funciona sem mudança (achados do levantamento)

- **Rotas de página já são dinâmicas** (`/[channelId]`) — canal de voz novo já tem URL funcionando.
- **LiveKit cria a sala sob demanda**: `room.createRoom({ name: channel.id, ... })` no join (`api/rtc/join/route.ts:45-50`) é upsert — qualquer string vira sala, sem provisionamento manual.
- **Presence é agnóstico de id**: `useChannelPresence` e `/api/rtc/presence` não têm whitelist.
- **`VoiceChannelAlert`** (aviso no Discord de canal cheio/vazio) já é uma tabela solta por `channelId` string, sem FK.
- **Alertas do Discord** (`notifyChannelJoin`) já recebem `{id, name}` genérico.
- **`TextMessage.channelId`/`TextChannelRead.channelId`** já existem como coluna (hoje só recebem o valor fixo `'global'`) — o schema já foi pensado pra essa migração.

O único ponto que hoje faz *whitelist* contra o objeto estático de voz é `applyPresenceWebhook` (`src/lib/rtc/presence.ts:311`), que descarta eventos do LiveKit pra `channelId` desconhecido via `getChannel()`.

## 5. Design proposto

### 5.1 Modelo de dados

Uma tabela `Channel`, com discriminador de tipo (**D1**, ver ADR-0001):

```prisma
enum ChannelType {
  VOICE
  TEXT
}

model Channel {
  id              String      @id @default(cuid())
  type            ChannelType
  name            String
  maxParticipants Int?        // null = sem limite (voice) ou não se aplica (text)
  sortIndex       Int         @default(0)
  createdAt       DateTime    @default(now())
  createdById     String?

  @@index([type, sortIndex])
}
```

Sem `archivedAt` — remover canal é hard-delete de verdade (ver ADR-0003, revogada por pedido de produto após a v1 desta RFC).

### 5.2 Migração e seed

A migration precisa **inserir os canais atuais com os mesmos ids** (`geral`, `primos`, `global`) — são os nomes usados como LiveKit room name e como `channelId` de mensagens existentes hoje; trocar o id invalidaria salas ativas, `VoiceChannelAlert`/`TextMessage`/`TextChannelRead` existentes.

```sql
INSERT INTO "Channel" (id, type, name, "maxParticipants", "sortIndex")
VALUES
  ('geral',  'VOICE', 'Geral',    20,   0),
  ('primos', 'VOICE', 'Primos',   20,   1),
  ('global', 'TEXT',  'Bate-papo', NULL, 0);
```

`TextMessage.channelId` e `TextChannelRead.channelId` ganham FK real pra `Channel.id` nessa mesma migração (hoje são string solta, sem FK — comentário explícito no schema: "canal ainda é constante de código, não tabela"). `onDelete: Cascade` (ver **D3**/ADR-0003, revogada — hard-delete apaga o histórico do canal junto, com aviso explícito na UI antes de confirmar).

### 5.3 Backend — `lib/rtc/channels.ts` vira DB-backed

`getChannel(id)`, `CHANNEL_LIST`, `DEFAULT_CHANNEL_ID` deixam de ser objeto/constante estáticos e viram queries (`prisma.channel.findUnique`, `findMany({ where: { type: 'VOICE' }, orderBy: { sortIndex: 'asc' } })`, "primeiro por `sortIndex`" respectivamente) — mesma função serve os dois tipos, filtrando por `type`.

Isso se propaga pra **9 rotas de API de voz** que importam hoje de `lib/rtc/channels.ts` (`join`, `kick`, `config`, `stop-camera`, `stop-stream`, `mute`, `unwatch`, `call`, `leave`) e pra `presence.ts` (o whitelist do webhook vira `await`). Dada a frequência de chamada, a leitura ganha um cache curto — ver **D4**/ADR-0004.

### 5.4 Chat de texto vira multi-canal (**D2**, ADR-0002)

`TEXT_CHANNEL_ID` (constante) é substituído por `channelId` explícito nas 3 rotas de chat, seguindo o formato decidido em **D6**/ADR-0006 (query param em GET, campo no corpo em mutações — sem reestruturar a URL das rotas):

- `api/chat/messages/route.ts` — lista e cria mensagem, agora por `channelId`.
- `api/chat/messages/clear/route.ts` — `/clear` passa a exigir `channelId`.
- `api/chat/read/route.ts` — leitura/marcação de lida por `(userId, channelId)`, já suportado pela PK composta de `TextChannelRead`.

Cada rota valida que o `channelId` recebido existe e é `type: TEXT` (mesma leitura cacheada do §5.3).

`useChatUnread` (contagem de não lidas, hoje um contador único) vira por canal — a sidebar mostra o badge por linha de canal de texto, no mesmo padrão visual que hoje já existe pros badges de voz (`ChannelParticipantsStack`, "AO VIVO").

### 5.5 Roteamento de texto

`/text` vira alias do canal de texto padrão (primeiro por `sortIndex` — mesmo padrão de `DEFAULT_CHANNEL_ID` pra voz). `/text/[channelId]` abre um canal específico. `global` (seedado em §5.2) é esse canal padrão inicial.

### 5.6 API de admin

Seguindo o padrão já existente em `/api/admin/groups` (mesma forma: list+create na raiz, update+delete em `[id]`):

- `GET /api/admin/channels` — lista os dois tipos, com `messageCount` por canal (pra UI avisar o tamanho do estrago antes do hard-delete, ver §5.6/D3)
- `POST /api/admin/channels` — cria `{ type, name, maxParticipants? }`. Em `VOICE`, `maxParticipants` ausente ou `null` é **canal sem limite** (a sala do LiveKit é criada sem teto); em `TEXT` o campo é ignorado. Decisão posterior à v1 desta RFC, que exigia o campo pra voz.
- `PATCH /api/admin/channels/[channelId]` — edita nome / limite / sortIndex
- `DELETE /api/admin/channels/[channelId]` — hard-delete de verdade (ver ADR-0003, revogada por pedido de produto): remove o canal e cascade o histórico de texto associado. A UI exige double confirm (nome do canal digitado) antes de chamar essa rota.

Gate de permissão: `isAdmin` **ou** `isChannelsAdmin` (**D5**, ADR-0005) — mesmo gate já usado pelo resto de `/admin/channels`.

### 5.7 UI de admin

Nova aba "Canais" em `AdminTabsView.tsx`, réplica do padrão de Grupos: `AdminChannelsView.tsx` + `ChannelFormDialog.tsx` + `ChannelCard.tsx` (nome, tipo — voz ou texto, com o campo de limite de participantes aparecendo só pra voz —, ordenação por criação, arquivar/reativar).

### 5.8 Frontend

- `VoiceChannelSidebar.tsx` troca o import estático de `CHANNEL_LIST` por um hook com polling (mesmo padrão de `useRtcEnabled`, SWR com `refreshInterval`) — pra sidebar atualizar quando outro usuário logado cria/arquiva um canal.
- A seção "Canais de texto" (hoje um `<BatePapoLink/>` fixo) vira uma lista, no mesmo padrão da seção de voz, com badge de não-lida por canal (§5.4).
- `DEFAULT_CHANNEL_ID` (hoje usado em `VoiceProvider`, `VoiceDock/index.tsx`, `flows/channel/index.tsx`) vira o primeiro canal de voz retornado pela query, propagado a partir do layout do lado servidor (que já busca dados do usuário na mesma request).

### 5.9 LiveKit / infra de voz

Sem mudança — `createRoom` já aceita qualquer nome, criado sob demanda no join. `stream-config`/`ChannelsConfig` seguem globais (§3).

## 6. Riscos e considerações de migração

- **Canal de voz excluído com gente conectada**: excluir não desconecta quem já está na sala — só impede novas entradas (ver ADR-0003, revogada). Diferente da versão original desta RFC, agora é irreversível: não existe mais "reativar".
- **Cache desatualizado após criar/editar/excluir**: TTL curto (ADR-0004) limita a janela de inconsistência.
- **Rotas de chat mudando de assinatura**: das duas frentes (voz e texto), essa é a de maior superfície de regressão — 3 rotas com ~15 pontos hoje fixos em `'global'`, usadas em todo envio/leitura de mensagem. Vale um cuidado extra de teste manual antes de shippar essa parte (ver plano de rollout, §8).

## 7. Perguntas resolvidas nesta rodada

1. ~~Fase 1 só voz, ou já incluir texto multi-canal?~~ → **Voz e texto juntos** (ADR-0002).
2. ~~Quem pode gerenciar canais?~~ → **`isAdmin` e `channels_admin`** (ADR-0005).
3. ~~Limite de canais simultâneos?~~ → **Sem limite por enquanto**; revisitar se virar problema de custo/spam (LiveKit `emptyTimeout: 300` em salas ociosas).
4. ~~Reordenação manual (drag-and-drop)?~~ → **Não** — ordem de criação (`sortIndex` sequencial), sem UI de reordenar nesta fase.

Sem perguntas em aberto pendentes no momento — [ADR-0001](./adr/0001-unified-channel-model.md), [ADR-0004](./adr/0004-cache-de-leitura-de-canais.md) e [ADR-0006](./adr/0006-chat-api-channelid-explicito.md) seguem como "Proposto" (decisões técnicas, não questionadas ainda) até revisão final da RFC. [ADR-0003](./adr/0003-soft-delete-de-canal.md) foi revogada depois: o produto pediu hard-delete de verdade em vez de soft-delete, ver o ADR.

## 8. Plano de rollout

1. Migration + seed (`geral`/`primos`/`global` como linhas reais na tabela `Channel` unificada, com FK de `TextMessage`/`TextChannelRead`) — sem mudança de comportamento visível.
2. `lib/rtc/channels.ts` vira DB-backed com cache (voz) — equivalente funcional ao estado atual.
3. Rotas de chat (`messages`, `messages/clear`, `read`) passam a exigir `channelId` explícito — ainda sem UI de múltiplos canais (o client todo aponta só pro `global`, que segue sendo o único texto existente até o passo 5).
4. API de admin (`/api/admin/channels`) + UI ("Canais" em `/admin/channels`), cobrindo os dois tipos.
5. Sidebar dinâmica pros dois tipos (lista de voz e lista de texto via hook) + badge de não-lida por canal + `/text/[channelId]`.
