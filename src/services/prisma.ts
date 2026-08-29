import { PrismaClient } from '@prisma/client';

// Cache em globalThis — o Next.js HMR reseta variáveis de módulo a cada
// reload, e sem esse cache cada reload abriria um pool de conexões novo
// contra o Postgres até estourar o limite.
const GLOBAL_KEY = '__opencallPrismaCache__';
const cache = (globalThis as unknown as { [GLOBAL_KEY]?: PrismaClient });

export const prisma: PrismaClient =
  cache[GLOBAL_KEY] ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') {
  cache[GLOBAL_KEY] = prisma;
}
