import { S3Client } from '@aws-sdk/client-s3';

// Cache em globalThis pelo mesmo motivo do prisma.ts — o HMR do Next reseta
// variáveis de módulo a cada reload, e sem isso cada reload abriria um client
// (e o pool de conexões HTTP dele) novo.
const GLOBAL_KEY = '__opencallR2Cache__';
const cache = globalThis as unknown as { [GLOBAL_KEY]?: S3Client };

// R2_ENDPOINT aponta pra qualquer storage compatível com S3 que não seja o R2:
// o MinIO do docker-compose local, e o Neon Object Storage no caminho da demo
// (ver docs/armazenamento). Vazio = R2 da Cloudflare, o padrão.
// forcePathStyle é exigido tanto pelo MinIO quanto pelo Neon (bucket no path,
// não em subdomínio); R2 aceita os dois modos, então ligar não quebra nada.
const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// A região entra no escopo da assinatura SigV4, então ela não é decorativa: o
// R2 exige literalmente "auto" (é o default aqui), enquanto um endpoint que
// implementa o protocolo de verdade valida a região real da conta — o Neon
// documenta us-east-2 / eu-central-1. O MinIO ignora, qualquer valor serve.
const region = process.env.R2_REGION || 'auto';

export const r2: S3Client =
  cache[GLOBAL_KEY] ??
  new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(process.env.R2_ENDPOINT),
    // Sem checksum de requisição por padrão. Com corpo STREAMADO (o upload de
    // anexo, ver ADR-0011) o SDK só consegue mandar checksum via
    // `Content-Encoding: aws-chunked` + trailer, um dialeto que nem todo
    // endpoint compatível com S3 aceita — e o MinIO do docker-compose é
    // justamente um deles. WHEN_REQUIRED mantém o checksum onde a operação
    // exige e sai do caminho no PutObject, que já é protegido por
    // Content-Length e por HTTPS.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  cache[GLOBAL_KEY] = r2;
}

export const R2_BUCKET = process.env.R2_BUCKET!;
