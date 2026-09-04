import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/services/r2';
import { publicImageUrl } from '@/lib/chat/imageUrl';
import {
  attachmentKindForMime,
  fileNameFromKey,
  MAX_ATTACHMENT_BYTES,
  objectExtensionFor,
  OCTET_STREAM,
  type AttachmentKind,
} from '@/lib/chat/attachments';

export { publicImageUrl };

/** [\w.-] só, truncado — vira o filename ASCII do Content-Disposition, nunca a chave do objeto. */
const FILE_NAME_MAX_LENGTH = 100;

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.-]/g, '_').slice(0, FILE_NAME_MAX_LENGTH);
}

/** chat/<authorId>/<id>.<ext> — authorId no path viabiliza órfãos e operação em lote (ver §4.2 da RFC-008). */
export function buildAttachmentKey(authorId: string, ext: string): string {
  return `chat/${authorId}/${randomUUID()}.${ext}`;
}

const DELETED_PREFIX = '[deleted-in-chat]/';

export function isDeletedKey(key: string): boolean {
  return key.startsWith(DELETED_PREFIX);
}

export function deletedKeyFor(key: string): string {
  return isDeletedKey(key) ? key : `${DELETED_PREFIX}${key}`;
}

/**
 * `file.type` do browser vem da extensão/registro do SO, não dos bytes reais
 * — um arquivo renomeado ou salvo com extensão errada passa por qualquer
 * checagem client-side mas tem um Content-Type mentiroso. O otimizador de
 * imagem do Next detecta o tipo real pelos magic bytes ao servir
 * `/_next/image` e devolve 400 se não bater, então precisamos da mesma
 * checagem aqui pra nunca gravar um ContentType que os bytes não sustentam.
 *
 * Com "qualquer arquivo" no escopo, o farejador deixou de ser um portão e
 * virou o classificador: o que ele NÃO reconhece é gravado como
 * application/octet-stream com Content-Disposition: attachment, e portanto
 * baixa em vez de renderizar (ver ADR-0013).
 */
const SNIFFERS: Array<{ mime: string; matches: (b: Buffer) => boolean }> = [
  { mime: 'image/png', matches: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', matches: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8' },
  // RIFF é envelope de três coisas diferentes: o que decide é o tipo em 8..12.
  { mime: 'image/webp', matches: (b) => isRiff(b, 'WEBP') },
  { mime: 'audio/wav', matches: (b) => isRiff(b, 'WAVE') },
  // ISO-BMFF (mp4/mov/m4a): 'ftyp' em 4..8, marca em 8..12. Áudio-só (M4A/M4B)
  // e QuickTime compartilham o container e precisam sair separados, senão um
  // .m4a viraria player de vídeo com tela preta.
  { mime: 'audio/mp4', matches: (b) => isFtyp(b) && /^M4[AB]/.test(b.toString('ascii', 8, 12)) },
  { mime: 'video/quicktime', matches: (b) => isFtyp(b) && b.toString('ascii', 8, 10) === 'qt' },
  { mime: 'video/mp4', matches: isFtyp },
  // EBML: webm e mkv têm o mesmo cabeçalho e só o DocType (ASCII, nos
  // primeiros bytes) separa. Sem 'webm' explícito não classificamos — mkv que
  // o Chrome não toca vira card de download, não player quebrado.
  { mime: 'video/webm', matches: (b) => isEbml(b) && b.toString('latin1', 0, 64).includes('webm') },
  { mime: 'video/ogg', matches: (b) => isOgg(b) && b.toString('latin1', 0, 64).includes('theora') },
  { mime: 'audio/ogg', matches: isOgg },
  { mime: 'audio/flac', matches: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'fLaC' },
  // Por último: ID3 e o frame sync do MPEG são os padrões mais frouxos da
  // lista (11 bits ligados casam com muita coisa), então só respondem pelo que
  // sobrou.
  { mime: 'audio/mpeg', matches: (b) => b.length >= 3 && (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) },
];

function isRiff(b: Buffer, kind: string): boolean {
  return b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === kind;
}

function isFtyp(b: Buffer): boolean {
  return b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp';
}

function isEbml(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

function isOgg(b: Buffer): boolean {
  return b.length >= 4 && b.toString('ascii', 0, 4) === 'OggS';
}

/** Cabeça necessária pro farejador mais fundo (DocType do EBML / codec do Ogg). */
export const SNIFF_HEAD_BYTES = 64;

export function sniffMediaContentType(head: Buffer): string | null {
  return SNIFFERS.find(({ matches }) => matches(head))?.mime ?? null;
}

/**
 * Valor de metadata do S3 tem que ser ASCII, e sanitizeFileName (que troca
 * tudo que não é [\w.-] por _) mostrava "Relat_rio_final.pdf" pro usuário.
 * Percent-encoding é ASCII E reversível, então o nome verdadeiro volta inteiro
 * do HeadObject.
 */
function encodeOriginalName(fileName: string): string {
  return encodeURIComponent(fileName.replace(/[\r\n]/g, ' ')).slice(0, 400);
}

/** Objeto anterior à mudança guarda o nome já sanitizado (sem `%`), que atravessa o decode intacto; `%` solto estoura e volta cru. */
function decodeOriginalName(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * RFC 5987: o `filename` ASCII cobre o browser velho, o `filename*` entrega o
 * nome com acento certo em todo o resto.
 */
function contentDispositionFor(kind: AttachmentKind, fileName: string): string {
  const disposition = kind === 'FILE' ? 'attachment' : 'inline';
  return `${disposition}; filename="${sanitizeFileName(fileName)}"; filename*=UTF-8''${encodeOriginalName(fileName)}`;
}

export interface UploadedAttachment {
  key: string;
  kind: AttachmentKind;
  mime: string;
  bytes: number;
  name: string;
}

export class AttachmentUploadError extends Error {
  constructor(readonly code: 'ATTACHMENT_TOO_LARGE', readonly kind: AttachmentKind) {
    super(code);
  }
}

/**
 * Lê do stream até juntar `SNIFF_HEAD_BYTES` (ou até o arquivo acabar, se for
 * menor) e devolve a cabeça junto com um Readable que a recoloca na frente do
 * resto — farejar exige olhar o começo, e o começo não pode ser consumido do
 * corpo que vai pro bucket.
 */
async function peekHead(body: ReadableStream<Uint8Array>): Promise<{ head: Buffer; stream: Readable }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (size < SNIFF_HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }

  const head = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  // objectMode: false — o SDK precisa de um stream de bytes; em modo objeto
  // cada Uint8Array viraria um "item" e o corpo sairia errado.
  //
  // O `finally` fecha a torneira do lado do client: destruir o Readable (é o
  // que o caminho de "grande demais" faz) chama `return()` no gerador, e sem
  // cancelar o reader o browser continuaria empurrando os 300MB pra uma
  // requisição que já foi decidida.
  const stream = Readable.from(
    (async function* () {
      try {
        for (const chunk of chunks) yield chunk;
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    })(),
    { objectMode: false },
  );

  return { head, stream };
}

/**
 * Upload passa pelo server: o client manda os bytes pro Next (mesma origem,
 * sem CORS) e o Next faz o PUT pro R2 — nunca um PUT direto do browser pro
 * bucket (isso exigiria CORS configurado no R2 pra cada origem de dev/prod).
 *
 * O corpo é STREAMADO, não bufferizado (ver ADR-0011): com vídeo de até 100MB,
 * um `arrayBuffer()` por upload concorrente era o heap do processo inteiro.
 * `ContentLength` é obrigatório aqui — sem ele o SDK teria que bufferizar pra
 * descobrir o tamanho, que é exatamente o que se está evitando.
 */
export async function uploadAttachment(params: {
  authorId: string;
  fileName: string;
  declaredBytes: number;
  body: ReadableStream<Uint8Array>;
}): Promise<UploadedAttachment> {
  const { authorId, fileName, declaredBytes, body } = params;

  const { head, stream } = await peekHead(body);
  const mime = sniffMediaContentType(head) ?? OCTET_STREAM;
  const kind = attachmentKindForMime(mime);

  // Depois do sniff e antes do resto do corpo subir: o vídeo de 300MB morre
  // nos primeiros kilobytes, não depois de atravessar a rede inteira.
  if (declaredBytes > MAX_ATTACHMENT_BYTES[kind]) {
    stream.destroy();
    throw new AttachmentUploadError('ATTACHMENT_TOO_LARGE', kind);
  }

  const key = buildAttachmentKey(authorId, objectExtensionFor(mime, fileName));

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: stream,
      ContentType: mime,
      ContentLength: declaredBytes,
      ContentDisposition: contentDispositionFor(kind, fileName),
      Metadata: {
        'author-id': authorId,
        'uploaded-at': new Date().toISOString(),
        'original-name': encodeOriginalName(fileName),
      },
    }),
  );

  return { key, kind, mime, bytes: declaredBytes, name: fileName };
}

export interface AttachmentHead {
  kind: AttachmentKind;
  mime: string;
  bytes: number;
  name: string;
}

/**
 * A verdade do anexo na hora de criar a mensagem: espécie, tipo, tamanho e nome
 * saem do objeto, não do corpo do POST (ver §5.4 da RFC de anexos). De quebra,
 * confirma que a chave existe — antes, uma chave inventada com o prefixo certo
 * virava uma mensagem com anexo quebrado pra sempre.
 */
export async function headAttachment(key: string): Promise<AttachmentHead | null> {
  const result = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => null);
  if (!result) return null;

  const mime = result.ContentType || OCTET_STREAM;
  const rawName = result.Metadata?.['original-name'];

  return {
    kind: attachmentKindForMime(mime),
    mime,
    bytes: result.ContentLength ?? 0,
    name: rawName ? decodeOriginalName(rawName) : fileNameFromKey(key),
  };
}

/**
 * Limpeza best-effort de um upload que nunca virou mensagem — a janela entre
 * "upload terminou" e "POST /api/chat/messages confirmou" falhar (ver
 * useChatMessages.sendMessage). Nunca bloqueia a resposta ao client.
 */
export async function deleteAttachment(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/**
 * Move o objeto pra baixo do prefixo [deleted-in-chat]/ (R2/S3 não tem rename:
 * CopyObject + DeleteObject, nessa ordem — ver D5). MetadataDirective REPLACE
 * preserva a metadata original e acrescenta deleted-by/deleted-at; sem isso o
 * padrão é COPY, que mantém a metadata mas não deixa adicionar as duas novas.
 * Um HeadObject busca a metadata original antes de copiar — ela não é
 * guardada em nenhum outro lugar (o Postgres não tem original-name). Se o
 * objeto for órfão (sem metadata, ou o Head falhar), cai pro authorId/data do
 * próprio Postgres como melhor esforço.
 *
 * Chamada fora da transação da rota de exclusão e sem bloquear a resposta —
 * falha aqui nunca desfaz o soft delete da linha no Postgres.
 */
export async function moveAttachmentToDeleted(params: {
  key: string;
  deletedBy: string;
  deletedAt: Date;
  fallbackAuthorId: string;
  fallbackUploadedAt: Date;
}): Promise<string> {
  const { key, deletedBy, deletedAt, fallbackAuthorId, fallbackUploadedAt } = params;
  if (isDeletedKey(key)) return key;

  const destinationKey = deletedKeyFor(key);

  const source = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => null);
  const original = source?.Metadata ?? {};

  await r2.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      CopySource: `${R2_BUCKET}/${encodeURIComponent(key)}`,
      Key: destinationKey,
      MetadataDirective: 'REPLACE',
      // REPLACE zera também ContentType/ContentDisposition (não só a metadata),
      // então os dois precisam ser recopiados à mão — senão todo objeto apagado
      // vira octet-stream no bucket e a cópia deixa de dizer o que era.
      ContentType: source?.ContentType,
      ContentDisposition: source?.ContentDisposition,
      Metadata: {
        'author-id': original['author-id'] ?? fallbackAuthorId,
        'uploaded-at': original['uploaded-at'] ?? fallbackUploadedAt.toISOString(),
        'original-name': original['original-name'] ?? '',
        'deleted-by': deletedBy,
        'deleted-at': deletedAt.toISOString(),
      },
    }),
  );

  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));

  return destinationKey;
}
