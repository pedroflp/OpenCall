import { ACCESS_CODE_ALPHABET } from '@/lib/auth/accessCode';

/**
 * Constantes e normalização puras, importadas por componentes client (ver
 * NoAccessPopover). generateUniqueInviteCode fica em generateInviteCode.ts,
 * que puxa Prisma — misturar os dois quebraria o bundle client (mesmo motivo
 * de lib/chat/textChannels.ts vs lib/chat/channel.ts).
 */
export const INVITE_CODE_LENGTH = 8;

const CONFUSABLES: Record<string, string> = { I: '1', L: '1', O: '0' };

/**
 * Mesma tolerância a confundível do código de pareamento (ver accessCode.ts),
 * mas sem truncar em tamanho fixo — aqui o código é colado inteiro num campo
 * de texto normal, não digitado caractere a caractere num OTP.
 */
export function normalizeInviteCode(raw: string): string {
  let normalized = '';
  for (const char of raw.trim().toUpperCase()) {
    const mapped = CONFUSABLES[char] ?? char;
    if (ACCESS_CODE_ALPHABET.includes(mapped)) normalized += mapped;
  }
  return normalized;
}
