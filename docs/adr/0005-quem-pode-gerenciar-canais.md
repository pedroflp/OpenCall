# ADR-0005: Criar/editar/arquivar canal (voz ou texto) exige `isAdmin` **ou** `channels_admin`

**Status**: Aceito
**RFC relacionada**: [rfc-dynamic-channels](../rfc-dynamic-channels.md)

## Contexto

O projeto já tem duas roles administrativas distintas (ver `middleware.ts` e `isCurrentUserChannelsAdmin`/`isCurrentUserAdmin`):

- `isAdmin`: acesso total à área `/admin/*`.
- `isChannelsAdmin` (`channels_admin`): hoje restrito à tela de gestão de usuários/grupos/acesso em `/admin/channels` — bloquear/liberar `canalAccess`, moderar chat (`/clear`, bloqueio de envio), kick de voz. É uma role operacional do dia a dia, não uma role de infraestrutura.

Criar um canal de voz tem efeito colateral em infraestrutura real (sala LiveKit nova, `emptyTimeout`); criar um canal de texto é mais barato (só uma linha + uma seção na sidebar). A dúvida original era se esse efeito colateral de voz justificava restringir a `isAdmin` só.

## Decisão

`POST`/`PATCH`/arquivar em `/api/admin/channels*` aceita tanto `isAdmin` quanto `isChannelsAdmin` — mesmo gate já usado pelo resto de `/admin/channels` hoje (gestão de grupos/usuários). Não há um gate mais restrito específico pra criação de canal.

## Alternativas consideradas

- **Só `isAdmin`**: era a proposta original, sob o argumento de que criar canal de voz é uma ação de infraestrutura diferente das outras que `channels_admin` já faz. Descartada — instalações self-host menores costumam ter um único operador do dia a dia com `channels_admin`, sem precisar necessariamente do admin completo por perto; exigir `isAdmin` criaria fricção no caso comum.

## Consequências

- `channels_admin` ganha uma superfície de ação nova (criar infraestrutura de sala) que antes não tinha — vale documentar isso na descrição da role, já que muda o que essa permissão significa na prática.
- Se abuso/erro de criação em excesso por um `channels_admin` se mostrar um problema real, o ajuste é reverter o gate pra `isAdmin` só — mudança de uma linha na rota, sem migração de schema.
- Sem uma trava de limite de canais (ver RFC, decidido como "sem limite por enquanto"), esse gate mais permissivo é o único freio contra criação acidental em excesso — vale reavaliar os dois juntos se isso virar um problema.
