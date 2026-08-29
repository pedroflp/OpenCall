import { randomUUID } from 'crypto';
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/services/r2';
import { publicImageUrl } from '@/lib/chat/imageUrl';
import { IMAGE_CONTENT_TYPE_EXT } from '@/lib/chat/channel';

export { publicImageUrl };

/** [\w.-] só, truncado — vira x-amz-meta-original-name, nunca a chave do objeto. */
const FILE_NAME_MAX_LENGTH = 100;

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.-]/g, '_').slice(0, FILE_NAME_MAX_LENGTH);
}

/** chat/<authorId>/<id>.<ext> — authorId no path viabiliza órfãos e operação em lote (ver §4.2 da RFC-008). */
export function buildImageKey(authorId: string, ext: string): string {
  return `chat/${authorId}/${randomUUID()}.${ext}`;
}

const DELETED_PREFIX = '[deleted-in-chat]/';

export function isDeletedKey(key: string): boolean {
  return key.startsWith(DELETED_PREFIX);
}

export function deletedKeyFor(key: string): string {
  return isDeletedKey(key) ? key : `${DELETED_PREFIX}${key}`;
}

export interface UploadedImage {
  key: string;
}

/**
 * `file.type` do browser vem da extensão/registro do SO, não dos bytes reais
 * — um arquivo renomeado ou salvo com extensão errada passa pelo allowlist
 * client-side mas tem um Content-Type mentiroso. O otimizador de imagem do
 * Next detecta o tipo real pelos magic bytes ao servir `/_next/image` e
 * devolve 400 se não bater, então precisamos da mesma checagem aqui pra
 * nunca gravar um ContentType que os bytes não sustentam.
 */
const MAGIC_BYTE_SNIFFERS: Array<{ contentType: string; matches: (bytes: Buffer) => boolean }> = [
  { contentType: 'image/png', matches: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { contentType: 'image/jpeg', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: 'image/gif', matches: (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    contentType: 'image/webp',
    matches: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export function sniffImageContentType(body: Buffer): string | null {
  return MAGIC_BYTE_SNIFFERS.find(({ matches }) => matches(body))?.contentType ?? null;
}

/**
 * Upload passa pelo server: o client manda os bytes pro Next (mesma origem,
 * sem CORS) e o Next faz o PUT pro R2 — nunca um PUT direto do browser pro
 * bucket (isso exigiria CORS configurado no R2 pra cada origem de dev/prod).
 */
export async function uploadImage(params: {
  authorId: string;
  contentType: string;
  fileName: string;
  body: Buffer;
}): Promise<UploadedImage> {
  const { authorId, contentType, fileName, body } = params;
  const ext = IMAGE_CONTENT_TYPE_EXT[contentType];
  const key = buildImageKey(authorId, ext);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
      Metadata: {
        'author-id': authorId,
        'uploaded-at': new Date().toISOString(),
        'original-name': sanitizeFileName(fileName),
      },
    }),
  );

  return { key };
}

/**
 * Limpeza best-effort de um upload que nunca virou mensagem — a janela entre
 * "upload terminou" e "POST /api/chat/messages confirmou" falhar (ver
 * useChatMessages.sendMessage). Nunca bloqueia a resposta ao client.
 */
export async function deleteImage(key: string): Promise<void> {
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
export async function moveImageToDeleted(params: {
  key: string;
  deletedBy: string;
  deletedAt: Date;
  fallbackAuthorId: string;
  fallbackUploadedAt: Date;
}): Promise<string> {
  const { key, deletedBy, deletedAt, fallbackAuthorId, fallbackUploadedAt } = params;
  if (isDeletedKey(key)) return key;

  const destinationKey = deletedKeyFor(key);

  const original = await r2
    .send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    .then((res) => res.Metadata ?? {})
    .catch(() => ({}) as Record<string, string>);

  await r2.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      CopySource: `${R2_BUCKET}/${encodeURIComponent(key)}`,
      Key: destinationKey,
      MetadataDirective: 'REPLACE',
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
