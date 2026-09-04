# ADR-0011: Upload de anexo vai em corpo cru streamado, não em multipart bufferizado

**Status**: Aceita
**RFC relacionada**: [rfc-anexos-de-arquivo](../rfc-anexos-de-arquivo.md)

## Contexto

`POST /api/chat/uploads` recebe `multipart/form-data` e faz
`Buffer.from(await file.arrayBuffer())` — o arquivo inteiro em memória antes de
qualquer byte sair pro R2. Com o teto de 10MB de imagem isso nunca importou.
Com vídeo entrando no escopo (teto de 100MB), três uploads simultâneos são
300MB de heap num processo Next que roda numa VPS pequena.

Some-se que `fetch()` não expõe progresso de upload em nenhum browser (o
`ReadableStream` de requisição com `duplex: 'half'` existe no Chrome mas não no
Safari, e não dá progresso — dá controle de escrita).

As opções eram:

1. Continuar em multipart, mas com um parser streamado (`busboy` e afins).
2. `PUT` pré-assinado direto do browser pro R2.
3. Corpo cru (`body: file`) pra própria rota, streamado pro R2.

## Decisão

Opção 3. `POST /api/chat/uploads?name=<nome>&size=<bytes>` com os bytes do
arquivo como corpo. O servidor lê 64 bytes de cabeça pra farejar o tipo, monta
um `Readable` que devolve a cabeça e depois o resto do stream, e passa isso ao
`PutObjectCommand` com `ContentLength` = `size`.

No cliente, o envio usa `XMLHttpRequest` — a única API que dá
`upload.onprogress`, que é o que alimenta a barra de progresso da mensagem
otimista.

## Alternativas consideradas

- **Parser multipart streamado**: resolve a memória, mas traz dependência nova só
  pra desempacotar um envelope que existe pra mandar *vários* campos — e aqui só
  existe um arquivo. Nome e tamanho cabem em query param.
- **`PUT` pré-assinado direto pro bucket**: é o desenho que mais tira carga do
  app, mas exige configurar CORS no R2 (e no MinIO do docker-compose) pra cada
  origem de dev e de produção, e passa a expor a URL de escrita do bucket ao
  browser. A rota atual já foi escrita explicitamente pra evitar isso
  (`storage.ts`), e streaming pelo servidor já resolve o problema de memória, que
  era o motivo real de mexer.

## Consequências

- O uso de memória por upload passa a ser o tamanho do chunk, não do arquivo.
- `ContentLength` depende do `?size=` informado pelo cliente. Quem mente corrompe
  o próprio upload (o R2 recusa ou trunca) e ninguém mais; quando o header
  `content-length` chega, ele é conferido contra o parâmetro.
- O teto por espécie é conferido **depois do sniff da cabeça**, ou seja, antes de
  o grosso do corpo ter subido — um vídeo de 300MB é cortado nos primeiros
  kilobytes.
- A rota deixa de aceitar `multipart/form-data`. Não há outro consumidor dela
  além do chat, então não há período de convivência a manter.
