import { randomBytes } from 'crypto';

export type PairingStatus = 'pending' | 'consumed' | 'expired' | 'not_found';

interface PairingRecord {
  userId: string;
  status: 'pending' | 'consumed';
  expiresAt: number;
}

const PAIRING_TTL_MS = 2 * 60 * 1000;
// Janela pra o polling do PC ainda enxergar "consumed" antes do registro sumir.
const CONSUMED_RETENTION_MS = 10 * 1000;

// Em memória, mesmo padrão de rateLimit.ts/callCooldown.ts — o app roda num
// processo único (Railway, sem Redis, ver rtc-infra-constraints). Um restart
// no meio de uma janela de 2min só derruba o pareamento em andamento; o
// usuário gera um QR novo, sem risco de segurança.
const pairings = new Map<string, PairingRecord>();

function isExpired(record: PairingRecord): boolean {
  return Date.now() > record.expiresAt;
}

export function createPairing(userId: string): { id: string; expiresAt: number } {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  pairings.set(id, { userId, status: 'pending', expiresAt });
  return { id, expiresAt };
}

export function getPairingStatus(id: string): PairingStatus {
  const record = pairings.get(id);
  if (!record) return 'not_found';
  if (isExpired(record)) {
    pairings.delete(id);
    return 'expired';
  }
  return record.status;
}

/**
 * Sem await entre o get e o set — não há corrida entre duas requests
 * concorrentes tentando consumir o mesmo código nesse processo único.
 */
export function consumePairing(id: string): { userId: string } | null {
  const record = pairings.get(id);
  if (!record) return null;
  if (isExpired(record)) {
    pairings.delete(id);
    return null;
  }
  if (record.status === 'consumed') return null;

  record.status = 'consumed';
  setTimeout(() => pairings.delete(id), CONSUMED_RETENTION_MS);
  return { userId: record.userId };
}
