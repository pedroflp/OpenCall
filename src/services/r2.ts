import { S3Client } from '@aws-sdk/client-s3';

// Cache em globalThis pelo mesmo motivo do prisma.ts — o HMR do Next reseta
// variáveis de módulo a cada reload, e sem isso cada reload abriria um client
// (e o pool de conexões HTTP dele) novo.
const GLOBAL_KEY = '__tdcR2Cache__';
const cache = globalThis as unknown as { [GLOBAL_KEY]?: S3Client };

// R2_ENDPOINT só existe pro docker-compose local (aponta pro MinIO em vez do
// R2 de verdade) — em produção fica vazio e o endpoint é sempre o da
// Cloudflare. forcePathStyle é exigido pelo MinIO (bucket no path, não em
// subdomínio); R2 aceita os dois modos então ligar não quebra nada.
const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const r2: S3Client =
  cache[GLOBAL_KEY] ??
  new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: Boolean(process.env.R2_ENDPOINT),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  cache[GLOBAL_KEY] = r2;
}

export const R2_BUCKET = process.env.R2_BUCKET!;
