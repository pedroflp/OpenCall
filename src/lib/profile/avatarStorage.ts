import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/services/r2';

/**
 * A FOTO DA MÁSCARA DE PERFIL (ver lib/profile/identity.ts).
 *
 * Duas coisas separam este arquivo do upload de imagem do chat: o avatar é
 * REPROCESSADO antes de subir, e ele é servido num `<img>` cru.
 *
 * O reprocessamento existe porque o avatar não passa pelo otimizador do Next —
 * `components/Avatar` renderiza um `<img>` do Radix, sem `/_next/image` no
 * caminho. O que sobe é literalmente o que todo mundo baixa, em toda linha da
 * sidebar, em toda mensagem do chat, em todo card de voz. Uma foto de 4032px
 * de celular viraria 8MB baixados pra desenhar 24 pixels.
 */

/** Lado do quadrado final. É teto, não alvo: foto menor não é esticada (ver `withoutEnlargement`). */
const AVATAR_SIZE = 512;

/** Antes de reprocessar. O estático encolhe muito depois disso; o animado nem tanto, daí o teto menor logo abaixo. */
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

/**
 * Depois de reprocessar, e só pro animado: o estático sempre sai pequeno, mas
 * um GIF de muitos quadros a 512² pode sair MAIOR do que entrou. Recusar aqui é
 * melhor do que deixar a sidebar inteira baixar isso a cada carga.
 */
const MAX_ANIMATED_OUTPUT_BYTES = 3 * 1024 * 1024;

export const AVATAR_CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function isAllowedAvatarContentType(contentType: string): boolean {
  return contentType in AVATAR_CONTENT_TYPE_EXT;
}

/**
 * Mesmo motivo da checagem do chat (ver sniffImageContentType em
 * lib/chat/storage.ts): `file.type` do browser vem da extensão, não dos bytes,
 * e um Content-Type mentiroso gravado no R2 é servido mentindo pra sempre.
 *
 * AVIF entra pelo box `ftyp` do ISO-BMFF — a marca fica no offset 8, e não nos
 * primeiros bytes como nos outros formatos. `avis` é a variante em sequência.
 */
const MAGIC_BYTE_SNIFFERS: Array<{ contentType: string; matches: (b: Buffer) => boolean }> = [
  { contentType: 'image/png', matches: (b) => b.length >= 8 && b.toString('hex', 0, 4) === '89504e47' },
  { contentType: 'image/jpeg', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: 'image/gif', matches: (b) => b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8' },
  {
    contentType: 'image/webp',
    matches: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    contentType: 'image/avif',
    matches: (b) =>
      b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(b.toString('ascii', 8, 12)),
  },
];

export function sniffAvatarContentType(body: Buffer): string | null {
  return MAGIC_BYTE_SNIFFERS.find(({ matches }) => matches(body))?.contentType ?? null;
}

/** Recorte escolhido no cropper, em pixels da imagem ORIGINAL — quadrado, e validado contra o tamanho real no servidor. */
export interface CropRect {
  x: number;
  y: number;
  size: number;
}

export function parseCropRect(raw: unknown): CropRect | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CropRect>;
    const { x, y, size } = parsed;
    if (![x, y, size].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (size! <= 0 || x! < 0 || y! < 0) return null;
    return { x: Math.round(x!), y: Math.round(y!), size: Math.round(size!) };
  } catch {
    return null;
  }
}

export interface ProcessedAvatar {
  body: Buffer;
  contentType: string;
  ext: string;
  animated: boolean;
}

export class AvatarTooHeavyError extends Error {}

/**
 * O recorte do cropper só vale pra imagem ESTÁTICA — em GIF/WebP animado o
 * cropper nem abre, e o enquadramento é sempre central (é o que
 * `fit: 'cover'` faz sozinho).
 *
 * O formato de saída do estático é JPEG, ou PNG quando a origem tem
 * transparência. Não é WebP, que seria menor: PNG e JPEG são os dois formatos
 * que qualquer decodificador de imagem cobre com segurança, e o avatar é a
 * imagem que mais atravessa superfície (sidebar, chat, card de voz, convite).
 *
 * 512 é TETO, não alvo: foto de 200px sai com 200px em vez de virar um borrão
 * esticado. Quem faz isso é `squareSide` abaixo, e não `withoutEnlargement` —
 * ver o porquê lá.
 */
export async function processAvatar(source: Buffer, crop: CropRect | null): Promise<ProcessedAvatar> {
  const metadata = await sharp(source, { animated: true }).metadata();
  const animated = (metadata.pages ?? 1) > 1;

  // `pageHeight` é a altura de UM quadro; num estático ele não existe e a
  // altura real é `height`. Ler a errada aqui deixaria o recorte fora do lugar
  // exatamente nos arquivos animados, cujo `height` é a tira de quadros
  // inteira (3 quadros de 180px viram um `height` de 540).
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;

  if (animated) {
    const container = metadata.format === 'webp' ? 'webp' : 'gif';
    const side = squareSide(width, height);
    const pipeline = sharp(source, { animated: true }).resize(side, side, { fit: 'cover', position: 'centre' });

    const body = await (container === 'webp' ? pipeline.webp() : pipeline.gif()).toBuffer();
    if (body.byteLength > MAX_ANIMATED_OUTPUT_BYTES) throw new AvatarTooHeavyError();

    return { body, contentType: `image/${container}`, ext: container, animated: true };
  }

  let pipeline = sharp(source);
  let side = squareSide(width, height);

  if (crop) {
    // O recorte vem do cliente, então é palpite até ser confirmado contra o
    // tamanho real: `extract` fora dos limites é erro do sharp, e um erro aqui
    // viraria "falhou ao enviar" pra quem só arrastou a foto.
    const size = Math.min(crop.size, width, height);
    const x = Math.min(crop.x, Math.max(0, width - size));
    const y = Math.min(crop.y, Math.max(0, height - size));
    if (size > 0) {
      pipeline = pipeline.extract({ left: x, top: y, width: size, height: size });
      side = squareSide(size, size);
    }
  }

  pipeline = pipeline.resize(side, side, { fit: 'cover', position: 'centre' });

  if (metadata.hasAlpha) {
    return { body: await pipeline.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png', ext: 'png', animated: false };
  }

  return {
    body: await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer(),
    contentType: 'image/jpeg',
    ext: 'jpg',
    animated: false,
  };
}

/**
 * O lado do quadrado de saída: 512, ou o menor lado da origem quando ela é
 * menor que isso.
 *
 * Parece o que `withoutEnlargement: true` faria, e NÃO é — foi assim que a
 * primeira versão saiu errada. Com `fit: 'cover'` pedindo 512×512, o
 * `withoutEnlargement` desiste do redimensionamento inteiro quando a origem é
 * menor num dos eixos, e **não recorta**: um GIF de 320×180 saía 320×180,
 * retangular. O `<img>` redondo do avatar esconderia isso na tela, mas o
 * arquivo estaria errado e o enquadramento central que a UI promete pro
 * animado nunca teria acontecido.
 *
 * Pedindo um quadrado que CABE na origem, o `cover` sempre tem o que recortar.
 */
function squareSide(width: number, height: number): number {
  return Math.min(AVATAR_SIZE, width || AVATAR_SIZE, height || AVATAR_SIZE);
}

/** avatars/<userId>/<uuid>.<ext> — o id no caminho é o que torna órfão localizável e remoção em lote possível, igual ao prefixo do chat. */
export function buildAvatarKey(userId: string, ext: string): string {
  return `avatars/${userId}/${randomUUID()}.${ext}`;
}

/**
 * Upload passa pelo servidor pelo mesmo motivo do chat: PUT direto do browser
 * exigiria CORS configurado no R2 pra cada origem de dev e de produção.
 *
 * `CacheControl` longo porque a key tem um uuid — trocar de foto gera uma key
 * nova, então a URL antiga nunca precisa ser revalidada, e o avatar deixa de
 * ser um round-trip por linha da sidebar a cada carga.
 */
export async function uploadAvatar(params: { userId: string; processed: ProcessedAvatar }): Promise<string> {
  const { userId, processed } = params;
  const key = buildAvatarKey(userId, processed.ext);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: processed.body,
      ContentType: processed.contentType,
      ContentLength: processed.body.byteLength,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { 'user-id': userId, 'uploaded-at': new Date().toISOString() },
    }),
  );

  return key;
}

/**
 * Melhor esforço, e sempre fora do caminho da resposta: a foto nova já está no
 * banco quando isto roda, e falhar aqui só deixa um objeto órfão no bucket —
 * nunca a pessoa sem avatar.
 */
export async function deleteAvatar(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
