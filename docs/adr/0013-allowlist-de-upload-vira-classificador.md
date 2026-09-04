# ADR-0013: A allowlist de upload vira classificador; o que não é mídia conhecida é servido como download

**Status**: Aceita
**RFC relacionada**: [rfc-anexos-de-arquivo](../rfc-anexos-de-arquivo.md)

## Contexto

Hoje o upload tem uma allowlist de quatro tipos de imagem, conferida três vezes
(client, rota, magic bytes) e que **rejeita** qualquer outra coisa. O pedido de
produto é aceitar qualquer arquivo — o que tira a allowlist do caminho e levanta
a pergunta que ela respondia de graça: o que impede alguém de subir um `.html`
com `<script>` e mandar o link pra alguém do canal?

## Decisão

A allowlist deixa de decidir *se* o arquivo entra e passa a decidir *como* ele é
gravado e servido:

- bytes que o sniffer reconhece como mídia tocável em browser (png, jpeg, gif,
  webp; mp4, quicktime, webm, ogv; mp3, m4a, ogg, wav, flac) são gravados com o
  `Content-Type` real e `Content-Disposition: inline`;
- **todo o resto** é gravado como `application/octet-stream` com
  `Content-Disposition: attachment; filename=...`, independente do que o cliente
  disse no `Content-Type` da requisição ou na extensão do nome.

Nada é rejeitado por tipo. O único motivo de recusa continua sendo tamanho.

## Alternativas consideradas

- **Allowlist maior** (imagem + vídeo + áudio + pdf + zip + office…): mantém a
  ideia de "tipos aprovados", mas contraria o pedido ("qualquer arquivo") e vira
  uma lista que ninguém termina de manter — todo formato de fora vira um chamado.
- **Denylist de tipos perigosos** (`text/html`, `image/svg+xml`, `.js`…): frágil
  pela natureza. Basta um tipo esquecido, ou um browser que farejo conteúdo por
  conta própria, pra furar. Forçar `octet-stream` + `attachment` no complemento da
  allowlist de mídia protege o caso desconhecido por construção, que é justamente
  o caso que a denylist erra.

## Consequências

- Um `.html`, um `.svg` ou um `.js` anexado **baixa**, não renderiza. Não há
  como transformar o bucket em hospedagem de página.
- Mesmo que renderizasse, o domínio público do bucket não é a origem do app —
  não há sessão nem cookie ali pra roubar. A defesa é dupla de propósito.
- O `Content-Type` gravado nunca vem do cliente. Isso também é o que faz o
  otimizador do `next/image` continuar funcionando: ele confere magic bytes ao
  servir e devolve 400 se o tipo declarado não bate (motivo original do sniffer,
  ver `storage.ts`).
- Formatos de mídia que os browsers não tocam (`.mkv`, `.avi`, `.heic`) caem em
  `FILE` de propósito: card de download honesto em vez de um player que nunca
  vai tocar.
- Não há varredura de malware. Um `.exe` anexado é um `.exe` baixável — o mesmo
  que já valia pra qualquer link colado no chat.
