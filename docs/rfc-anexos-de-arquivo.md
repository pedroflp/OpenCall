# RFC: Anexo de qualquer arquivo no chat (com player próprio de vídeo e de áudio)

**Status**: Executada
**Decisões relacionadas**: [ADR-0011](./adr/0011-upload-em-corpo-cru-streamado.md), [ADR-0012](./adr/0012-anexo-unico-em-colunas-da-mensagem.md), [ADR-0013](./adr/0013-allowlist-de-upload-vira-classificador.md)

## 1. Contexto

O chat de texto aceita **um anexo por mensagem, e só imagem**. A restrição está
espalhada em cinco lugares que precisam concordar entre si:

- `lib/chat/channel.ts` — `IMAGE_CONTENT_TYPE_EXT` (png/jpeg/webp/gif) e `MAX_IMAGE_BYTES` (10MB);
- `useChatAttachment.ts` — rejeita no client o que não está no mapa, e lê `naturalWidth/naturalHeight` com um `new Image()`;
- `api/chat/uploads` — recebe `multipart/form-data`, faz `Buffer.from(await file.arrayBuffer())` e confere magic bytes;
- `TextMessage` — colunas `image_key`, `image_width`, `image_height`, `image_bytes`;
- `MessageItem` — `ImageBubble` com `next/image` e lightbox.

Mandar um mp4, um mp3 ou um PDF hoje é impossível: o `<input>` tem
`accept="image/..."`, o hook rejeita o `file.type`, e a rota devolve
`UNSUPPORTED_CONTENT_TYPE`. Quem quer compartilhar um vídeo cola link do YouTube
(que tem card) ou não compartilha.

Dois problemas atrapalham a extensão direta do que existe:

1. **O upload é bufferizado inteiro em memória** (`arrayBuffer()` + `Buffer.from`).
   Com o teto de 10MB de imagem isso é irrelevante; com vídeo de 100MB, cada
   upload simultâneo é 100MB de heap no processo do Next — numa VPS pequena, dois
   uploads concorrentes derrubam o app.
2. **`fetch` não expõe progresso de upload.** Uma imagem de 2MB sobe rápido
   demais pra alguém reparar; um vídeo de 80MB sem barra de progresso parece
   travado.

## 2. Objetivo

Permitir anexar **qualquer arquivo** a uma mensagem, e renderizar cada tipo pelo
que ele é:

- **imagem** — o que já existe hoje (bolha + lightbox), sem regressão;
- **vídeo** — player embutido na mensagem, com **UI própria** (nada de `controls`
  nativo do browser);
- **áudio/música** — player embutido, com **UI própria e diferente da de vídeo**
  (card horizontal, não retângulo com barra por cima);
- **qualquer outra coisa** — card de arquivo com ícone por extensão, nome,
  tamanho e download.

## 3. Não-objetivos

- **Vários anexos por mensagem.** Continua um por mensagem (ver ADR-0012). O
  compositor, a mensagem otimista, o preview de citação e o DTO todos assumem
  "zero ou um" hoje; mudar isso é uma RFC própria.
- **Transcodificação / compressão no servidor.** O arquivo é gravado como veio.
  Um `.mkv` que o browser não toca vira card de download, não um job de ffmpeg.
- **Thumbnail (poster) de vídeo gerado e armazenado.** O player usa
  `preload="metadata"`, que já pinta o primeiro quadro. Gerar poster exigiria um
  segundo objeto no bucket por vídeo (ver §11).
- **Waveform real de áudio.** Desenhar a forma de onda exige baixar e decodificar
  o arquivo inteiro (`decodeAudioData`) antes de mostrar qualquer coisa — caro e
  visível para o usuário. Waveform *sintética* (barrinhas aleatórias) seria
  desenho bonito mentindo sobre o áudio; fica de fora.
- **Antivírus / varredura de conteúdo.** Fora de escopo (ver §9).

## 4. O que já funciona sem mudança

- **`chat/<authorId>/<uuid>.<ext>`** como chave já é agnóstico de tipo, e o
  prefixo por autor é o que sustenta a checagem de posse na rota de mensagens
  (`key.startsWith('chat/<user.id>/')`) e a limpeza de órfão.
- **`[deleted-in-chat]/`** (CopyObject + DeleteObject) não olha o tipo do objeto.
- **Ciclo de vida do anexo otimista** — anexo só sobe no submit, órfão é apagado
  se o POST falha, `blob:` é revogado por quem detém a posse. Nada disso muda.
- **SSE** — o evento `message` carrega o DTO inteiro; anexo novo viaja de graça.
- **R2 e MinIO servem `Range`**, que é o que o `<video>` precisa pra buscar
  posição sem baixar o arquivo inteiro.

## 5. Design

### 5.1 Modelo de dados

As quatro colunas de imagem viram sete colunas de anexo, **renomeadas** (não
duplicadas — ver ADR-0012):

```prisma
enum AttachmentKind {
  IMAGE
  VIDEO
  AUDIO
  FILE
}

model TextMessage {
  // ...
  attachmentKind       AttachmentKind? @map("attachment_kind")
  attachmentKey        String?         @map("attachment_key")
  attachmentName       String?         @map("attachment_name")
  attachmentMime       String?         @map("attachment_mime")
  attachmentBytes      Int?            @map("attachment_bytes")
  attachmentWidth      Int?            @map("attachment_width")
  attachmentHeight     Int?            @map("attachment_height")
  attachmentDurationMs Int?            @map("attachment_duration_ms")
}
```

`width`/`height` só fazem sentido pra `IMAGE`/`VIDEO`; `durationMs` só pra
`VIDEO`/`AUDIO`. São nulos no resto — a invariante é da rota de envio, não do
banco (mesmo padrão do "content ou imagem" que já existe).

**Migração** (`20260903193000_message_attachments`): `ALTER ... RENAME COLUMN`
para as quatro que já existem, `ADD COLUMN` para as três novas, e backfill de
`attachment_kind = 'IMAGE'` + `attachment_mime` derivado da extensão da chave
para toda linha com anexo. Nenhuma linha existente perde nada; `attachment_name`
fica nulo no histórico (o nome original nunca esteve no Postgres, só na metadata
do R2) e a UI cai no nome do arquivo derivado da chave.

### 5.2 Classificação: o tipo é derivado dos bytes, não do cliente

`IMAGE_CONTENT_TYPE_EXT`/`isAllowedImageContentType` (allowlist que **rejeita**)
viram `lib/chat/attachments.ts` (classificador que **rotula**) — ver ADR-0013:

```
bytes → sniffMediaContentType() → mime conhecido?
                                   ├─ sim  → esse mime, ContentDisposition: inline
                                   └─ não  → application/octet-stream,
                                             ContentDisposition: attachment
mime → attachmentKindForMime()   → image/* IMAGE · video/* VIDEO · audio/* AUDIO · resto FILE
```

Só entra como mídia o que os browsers realmente tocam: png, jpeg, gif, webp;
mp4, quicktime, webm, ogv; mpeg (mp3), mp4 (m4a), ogg, wav, flac. `.mkv`, `.avi`
e `.heic` não são reconhecidos e caem em `FILE` de propósito — melhor um card de
download honesto que um `<video>` com um X no meio.

Nada é rejeitado por tipo. `MAX_ATTACHMENT_BYTES` passa a ser por espécie:

| espécie | teto  | por quê |
| ------- | ----- | ------- |
| IMAGE   | 10MB  | inalterado — passa pelo otimizador do `next/image` |
| VIDEO   | 100MB | maior anexo que faz sentido num chat sem transcodificação |
| AUDIO   | 50MB  | ~50min de mp3 a 128kbps |
| FILE    | 50MB  | documento, zip, log |

### 5.3 Upload: corpo cru, streamado, com progresso

`POST /api/chat/uploads?name=<nome>&size=<bytes>`, corpo = os bytes do arquivo
(ver ADR-0011). Sai o `multipart/form-data`, sai o `arrayBuffer()`.

1. Lê do corpo até juntar 64 bytes de cabeça (o suficiente pra qualquer sniffer);
2. `sniffMediaContentType(head)` → mime e espécie;
3. Confere o teto **da espécie** — o vídeo de 300MB morre aqui, antes de o
   grosso do corpo ter subido;
4. `PutObject` com um `Readable` que devolve a cabeça e depois o resto do stream,
   `ContentLength` = `size`, `ContentType` = mime, `ContentDisposition` = `inline`
   (mídia) ou `attachment; filename="..."; filename*=UTF-8''...` (arquivo);
5. Responde `{ key, kind, mime, bytes, name }`.

O nome original vai pra metadata `original-name` **percent-encoded**
(`encodeURIComponent`) — valor de metadata do S3 tem que ser ASCII, e
`sanitizeFileName` (que troca tudo que não é `[\w.-]` por `_`) transformava
"Relatório final.pdf" em "Relat_rio_final.pdf" na cara do usuário. Percent-encoding
é ASCII e reversível. Objeto antigo (sanitizado, sem `%`) volta idêntico do
`decodeURIComponent`, e um `%` solto cai no `catch` e volta cru.

No cliente, o upload usa `XMLHttpRequest` em vez de `fetch`: é a única forma de
ter `upload.onprogress`, que vira a barra de progresso da mensagem otimista.

### 5.4 Envio da mensagem: o servidor confere o objeto

`POST /api/chat/messages` recebe `attachment: { key, width?, height?, durationMs? }`
e **não** aceita mime/bytes/nome do cliente. Depois de checar o prefixo de posse,
faz um `HeadObject` na chave e tira dali `ContentType`, `ContentLength` e
`original-name`. É uma ida a mais ao R2 por mensagem com anexo, e ela paga:

- fecha a brecha de gravar `mime`/`bytes` que os bytes não sustentam (hoje
  `bytes` vem de `input.image.file.size`, valor do cliente, sem conferência);
- valida que a chave **existe** — hoje uma chave inventada com o prefixo certo
  vira uma mensagem com anexo quebrado pra sempre.

Só `width`/`height`/`durationMs` continuam vindo do cliente: são metadados de
apresentação (reservar a caixa antes de carregar, mostrar a duração antes do
play) que o servidor não tem como extrair sem decodificar o arquivo. Mentir neles
estraga o layout da própria mensagem de quem mentiu.

### 5.5 DTO

```ts
attachment: {
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  url: string;
  name: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
} | null
```

`MessageDTO.image` deixa de existir. `replyTo.hasImage: boolean` vira
`replyTo.attachmentKind: AttachmentKind | null`, e a tira de citação passa a
dizer "Imagem"/"Vídeo"/"Áudio"/"Arquivo" com o ícone certo em vez de sempre
"Imagem".

### 5.6 Cliente

`useChatAttachment` deixa de rejeitar por tipo e passa a **medir**:

| espécie do `file.type` | o que lê                                  | como |
| ---------------------- | ----------------------------------------- | ---- |
| `image/*`              | `naturalWidth`/`naturalHeight`            | `new Image()` |
| `video/*`              | `videoWidth`/`videoHeight`/`duration`     | `<video preload="metadata">` |
| `audio/*`              | `duration`                                | `<audio preload="metadata">` |
| resto / vazio          | nada                                      | — |

**Falhar em medir não bloqueia o envio**: um `.heic` que o Chrome não decodifica,
ou um `.mkv` que o `<video>` recusa, cai pra `FILE` e vai como anexo de arquivo.
O único erro que ainda impede o envio é estourar o teto de tamanho. Isso é o que
faz "qualquer arquivo" ser verdade — antes, uma medição frustrada virava
`INVALID_IMAGE` e o anexo morria ali.

O `<input>` perde o `accept`, o drop zone diz "Solte o arquivo aqui", e o paste
passa a aceitar `clipboardData.files` inteiro em vez de só itens `image/*`.

### 5.7 Players

Três componentes novos em `flows/channel/text/media/`, sobre um hook comum
(`useMediaElement`) que embrulha o `<video>`/`<audio>` e devolve estado de
reprodução, tempo, duração, buffer, volume e velocidade. A barra de busca
(`MediaSeekBar`) também é compartilhada: trilho + faixa carregada + faixa tocada
+ puxador, arraste com `setPointerCapture` (funciona igual com mouse e toque),
`role="slider"` com as setas do teclado.

**`mediaBus`** — registro em módulo dos elementos de mídia montados. Dar play em
um pausa todos os outros: sem isso, rolar o canal e clicar em três vídeos toca os
três juntos.

#### Vídeo (`VideoPlayer`)

Retângulo de 420px (limitado à largura da mensagem), proporção travada por
`width`/`height` pra lista não pular quando o metadata chega.

```
┌───────────────────────────────────────┐
│                                       │
│                 ▶                     │  ← antes do 1º play: botão central
│                                    2:31│    + duração no canto
│                                       │
│ ▁▁▁▁▁▁▁▁▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░ │  ← trilho: tocado / bufferizado / vazio
│ ▶  ↺10 ↻10   0:42 / 2:31    🔊 ⧉  ⛶  │
└───────────────────────────────────────┘
```

- `controls` nativo **desligado** (`[&::-webkit-media-controls]:hidden` de sobra);
- clique no vídeo alterna play/pause, duplo clique alterna tela cheia;
- barra some sozinha 2,5s depois do último movimento do mouse enquanto toca, e
  volta em `mousemove`/foco/pausa;
- teclado com o player focado: espaço/`k` play-pause, `←`/`→` ±5s, `j`/`l` ±10s,
  `m` mudo, `f` tela cheia;
- volume é botão + trilho fino que aparece no hover (não ocupa espaço fixo numa
  barra de 420px);
- picture-in-picture só aparece se `document.pictureInPictureEnabled`.

#### Áudio (`AudioPlayer`)

Card horizontal de 380px — deliberadamente **outra forma**, porque música não tem
imagem pra ocupar retângulo:

```
┌──────────────────────────────────────────────┐
│  ⏵   nome-da-faixa.mp3                  1.5x │
│ (44) ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░  🔊  │
│      1:12                              3:48  │
└──────────────────────────────────────────────┘
```

- botão redondo grande de play/pause à esquerda, na cor primária;
- nome do arquivo como título (é o que existe — não há tag ID3 lida);
- trilho fino com tempo decorrido à esquerda e duração à direita;
- velocidade cicla 1x → 1.25x → 1.5x → 2x → 1x (serve pra recado de voz);
- volume igual ao do vídeo.

#### Arquivo (`FileCard`)

Card com caixa de ícone por extensão (`pdf-01`, `file-zip`, `txt-01`, `csv-01`,
`doc-01`, `ppt-01`, `file-spreadsheet`, senão `file-02`), nome, extensão + tamanho
e ícone de download. É um `<a>` — o `Content-Disposition: attachment` gravado no
objeto é o que faz baixar em vez de abrir (o atributo `download` do HTML é
ignorado entre origens diferentes, e o bucket é outro domínio).

## 6. Decisões

- **D1 — Um anexo por mensagem, em colunas da própria linha** (ADR-0012).
- **D2 — Upload em corpo cru streamado, com progresso via XHR** (ADR-0011).
- **D3 — Allowlist vira classificador; não-mídia é servida como download** (ADR-0013).
- **D4 — `mime`/`bytes`/`name` vêm do `HeadObject`, não do cliente** (§5.4).
- **D5 — Falha ao medir metadata degrada pra `FILE`, não bloqueia o envio** (§5.6).
- **D6 — Player próprio, `controls` nativo desligado nos dois** — é o pedido de
  produto, e é o que deixa vídeo e áudio terem formas diferentes.
- **D7 — Um som por vez no canal** (`mediaBus`, §5.7).

## 7. Segurança

- **Nada é executável a partir do bucket.** Só o que o sniffer reconhece como
  mídia recebe um `Content-Type` real; todo o resto vira
  `application/octet-stream` + `Content-Disposition: attachment`. HTML, SVG e
  `.js` anexados **baixam**, não renderizam — e mesmo que renderizassem, o
  domínio público do bucket não é a origem do app (sem sessão, sem cookie).
- **Posse continua pelo prefixo.** `chat/<authorId>/` é checado no envio e no
  DELETE de órfão; ninguém anexa nem apaga objeto de outro.
- **Teto por espécie é checado duas vezes** — no cliente (feedback) e no servidor
  logo depois do sniff (verdade).
- **Não há varredura de malware.** Um `.exe` anexado é um `.exe` baixável. Isso
  já valia pra qualquer link colado no chat; o canal é de comunidade fechada
  (`canalAccess`), e quem abusa é bloqueado pelo `chatBlocked` que já existe.

## 8. Impacto e migração

| arquivo | mudança |
| --- | --- |
| `prisma/schema.prisma` + migration | enum `AttachmentKind`, rename de 4 colunas, 3 colunas novas |
| `lib/chat/attachments.ts` | **novo** — espécies, tetos, sniffers, mime↔ext, rótulos |
| `lib/chat/channel.ts` | sai o bloco de imagem (foi pro arquivo acima) |
| `lib/chat/storage.ts` | upload streamado, `headAttachment`, renomeações |
| `lib/chat/dto.ts` | `image` → `attachment`; `hasImage` → `attachmentKind` |
| `api/chat/uploads` | corpo cru + stream |
| `api/chat/messages` (POST) | `HeadObject` + validação por espécie |
| `api/chat/messages/[id]`, `/clear` | renomeação de campo |
| `useChatAttachment`, `useChatMessages`, `types` | espécies, medição tolerante, XHR com progresso |
| `MessageComposer`, `MessageItem`, `MessageList`, `TextChannelView` | preview, bolha por espécie, textos |
| `flows/channel/text/media/*` | **novo** — bus, hook, seek bar, 3 players |

Nenhuma mudança de infra: mesmo bucket, mesma origem de upload, sem CORS novo.

## 9. Riscos

- **`ContentLength` vem do `?size=`.** Cliente que mente sobre o tamanho corrompe
  o próprio upload (o R2 recusa ou trunca) — não afeta ninguém mais. O header
  `content-length`, quando presente, é conferido contra o parâmetro.
- **Vídeo grande em canal movimentado consome banda de saída.** Egress do R2 é
  grátis, mas armazenamento não. Se virar problema, o caminho é retenção por
  idade, não teto menor.
- **`preload="metadata"` em muitos vídeos numa página** faz uma requisição de
  cabeçalho por vídeo ao rolar. É pequeno (poucos KB por arquivo) e é o preço de
  não ter poster.

## 10. Plano de implementação

1. Schema + migration + `lib/chat/attachments.ts`.
2. `storage.ts` (stream, sniff, head) e `api/chat/uploads`.
3. `dto.ts` e as três rotas de mensagem.
4. `types.ts`, `useChatAttachment`, `useChatMessages` (XHR + progresso).
5. `media/` — bus, hook, seek bar, `VideoPlayer`, `AudioPlayer`, `FileCard`.
6. `MessageItem`/`MessageComposer`/`MessageList`/`TextChannelView`.

## 11. Trabalho futuro

- **Poster de vídeo**: extrair o primeiro quadro no cliente (canvas) e subir como
  segundo objeto (`<key>.poster.jpg`), pra lista não pedir metadata de vídeo
  nenhum enquanto rola.
- **Vários anexos por mensagem** (grade de imagens, lista de arquivos).
- **Tags ID3** no card de áudio (título/artista/capa) em vez do nome do arquivo.
