# RFC: Canais dinâmicos (voz e texto)

**Status**: Proposto
**Decisões relacionadas**: [ADR-0001](./adr/0001-unified-channel-model.md), [ADR-0002](./adr/0002-fase-1-so-voz.md), [ADR-0003](./adr/0003-soft-delete-de-canal.md), [ADR-0004](./adr/0004-cache-de-leitura-de-canais.md), [ADR-0005](./adr/0005-quem-pode-gerenciar-canais.md)

## 1. Contexto

Hoje os canais são estáticos:

- **Voz**: objeto fixo em `src/lib/rtc/channels.ts` (`CHANNELS = { geral, primos }`). Criar um canal novo é editar código e fazer deploy.
- **Texto**: um único canal global (`TEXT_CHANNEL_ID = 'global'` em `src/lib/chat/channel.ts`), referenciado por valor fixo em ~15 pontos das rotas de chat (`api/chat/messages`, `messages/clear`, `read`). Não existe "canal de texto" como conceito — existe *o* chat.

Isso limita o produto: comunidades que precisam de mais de dois canais de voz, ou de canais de texto por assunto/grupo, não têm como sem alteração de código.

## 2. Objetivo

Permitir que um admin **crie, edite e arquive canais de voz** dinamicamente, sem deploy, com a UI (sidebar, join, presence, alertas do Discord) reagindo automaticamente.

## 3. Não-objetivo (nesta fase)

Canais de texto múltiplos ficam **fora do escopo desta RFC** — ver [ADR-0002](./adr/0002-fase-1-so-voz.md). O chat continua único (`global`) por enquanto; o schema já é compatível com uma extensão futura (`TextMessage.channelId` já existe como coluna).

Também fora do escopo: qualidade de stream por canal (`ChannelsConfig` continua um singleton global — não há pedido de produto pra isso hoje).

## 4. O que já funciona sem mudança (achados do levantamento)

- **Rotas de página já são dinâmicas** (`/[channelId]`) — canal novo já tem URL funcionando.
- **LiveKit cria a sala sob demanda**: `room.createRoom({ name: channel.id, ... })` no join (`api/rtc/join/route.ts:45-50`) é upsert — qualquer string vira sala, sem provisionamento manual.
- **Presence é agnóstico de id**: `useChannelPresence` e `/api/rtc/presence` não têm whitelist.
- **`VoiceChannelAlert`** (aviso no Discord de canal cheio/vazio) já é uma tabela solta por `channelId` string, sem FK.
- **Alertas do Discord** (`notifyChannelJoin`) já recebem `{id, name}` genérico.

O único ponto que hoje faz *whitelist* contra o objeto estático é `applyPresenceWebhook` (`src/lib/rtc/presence.ts:311`), que descarta eventos do LiveKit pra `channelId` desconhecido via `getChannel()`.

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
  maxParticipants Int?        // só voice; null pra text
  sortIndex       Int         @default(0)
  archivedAt      DateTime?   // ver D3 — soft-delete
  createdAt       DateTime    @default(now())
  createdById     String?

  @@index([type, archivedAt, sortIndex])
}
```

### 5.2 Migração e seed

A migration precisa **inserir os canais atuais com os mesmos ids** (`geral`, `primos`) — são os nomes usados como LiveKit room name hoje, e trocar o id invalidaria salas ativas, `VoiceChannelAlert` existentes e qualquer referência guardada em presence. O canal de texto `global` também vira uma linha (`type: TEXT`), mesmo sem UI de gestão nesta fase — deixa o dado consistente pra quando a Fase 2 (texto multi-canal) acontecer.

```sql
INSERT INTO "Channel" (id, type, name, "maxParticipants", "sortIndex")
VALUES
  ('geral',  'VOICE', 'Geral',  20, 0),
  ('primos', 'VOICE', 'Primos', 20, 1),
  ('global', 'TEXT',  'Bate-papo', NULL, 0);
```

### 5.3 Backend — `lib/rtc/channels.ts` vira DB-backed

`getChannel(id)`, `CHANNEL_LIST`, `DEFAULT_CHANNEL_ID` deixam de ser objeto/constante estáticos e viram queries (`prisma.channel.findUnique`, `findMany({ where: { type: 'VOICE', archivedAt: null }, orderBy: { sortIndex: 'asc' } })`, "primeiro por `sortIndex`" respectivamente).

Isso se propaga pra **9 rotas de API** que importam hoje de `lib/rtc/channels.ts` (`join`, `kick`, `config`, `stop-camera`, `stop-stream`, `mute`, `unwatch`, `call`, `leave`) e pra `presence.ts` (o whitelist do webhook vira `await`). Given a frequência de chamada (todo join, todo webhook do LiveKit), a leitura ganha um cache curto — ver **D4** / ADR-0004.

### 5.4 API de admin

Seguindo o padrão já existente em `/api/admin/groups` (mesma forma: list+create na raiz, update+delete em `[id]`):

- `GET /api/admin/channels` — lista (inclui arquivados, pra UI mostrar/reativar)
- `POST /api/admin/channels` — cria `{ type, name, maxParticipants? }`
- `PATCH /api/admin/channels/[channelId]` — edita nome / limite / sortIndex / arquiva-reativa
- `DELETE /api/admin/channels/[channelId]` — **não existe hard-delete** nesta fase (ver D3); o verbo DELETE arquiva.

Gate de permissão: ver **D5** / ADR-0005.

### 5.5 UI de admin

Nova aba "Canais" em `AdminTabsView.tsx`, réplica do padrão de Grupos: `AdminChannelsView.tsx` + `ChannelFormDialog.tsx` + `ChannelCard.tsx` (nome, tipo — travado em "voz" nesta fase —, limite de participantes, ordenação, arquivar/reativar).

### 5.6 Frontend

- `VoiceChannelSidebar.tsx` troca o import estático de `CHANNEL_LIST` por um hook com polling (mesmo padrão de `useRtcEnabled`, SWR com `refreshInterval`) — pra sidebar atualizar quando outro usuário logado cria/arquiva um canal.
- `DEFAULT_CHANNEL_ID` (hoje usado em `VoiceProvider`, `VoiceDock/index.tsx`, `flows/channel/index.tsx`) vira o primeiro canal retornado pela query, propagado a partir do layout do lado servidor (que já busca dados do usuário na mesma request).

### 5.7 LiveKit / infra de voz

Sem mudança — `createRoom` já aceita qualquer nome, criado sob demanda no join. `stream-config`/`ChannelsConfig` seguem globais.

## 6. Riscos e considerações de migração

- **Canal arquivado com gente conectada**: precisa decidir se arquivar desconecta quem está na sala agora ou só esconde da lista pra novas entradas (recomendo: só esconde — arquivar não deveria ser um kick).
- **Cache desatualizado após criar/arquivar**: TTL curto (ver ADR-0004) limita a janela de inconsistência; aceitável dado o volume de uso.
- **Contagem/limite de canais**: não há hoje uma trava contra criação em massa — deixado como pergunta em aberto (§7).

## 7. Perguntas em aberto

1. Confirmar D2 (Fase 1 só voz) — ou o texto multi-canal deveria entrar já na primeira leva?
2. Existe um limite de canais simultâneos a impor (por custo de sala LiveKit ociosa, `emptyTimeout: 300`)?
3. Reordenação de canais na sidebar é manual (drag-and-drop) ou só ordem de criação (`sortIndex` sequencial, sem UI de reordenar por enquanto)?

## 8. Plano de rollout

1. Migration + seed (`geral`/`primos`/`global` como linhas reais) — sem mudança de comportamento visível.
2. `lib/rtc/channels.ts` vira DB-backed, com cache — ainda sem UI de criação (equivalente funcional ao estado atual).
3. API de admin + UI ("Canais" em `/admin/channels`).
4. Sidebar dinâmica (troca o import estático pelo hook com polling).
5. (Fase 2, RFC separada) texto multi-canal, se D2 for revisitada.
