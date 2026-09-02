import { randomInt } from 'crypto';
import { prisma } from '@/services/prisma';
import { ACCESS_CODE_ALPHABET } from '@/lib/auth/accessCode';
import { INVITE_CODE_LENGTH } from './inviteCode';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Único no banco (constraint @unique) — o espaço é 32^8, o retry só cobre a
 * colisão improvável. Server-only (puxa Prisma) — ver inviteCode.ts pras
 * constantes/normalização client-safe.
 */
export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const existing = await prisma.inviteCode.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error('INVITE_CODE_COLLISION');
}
