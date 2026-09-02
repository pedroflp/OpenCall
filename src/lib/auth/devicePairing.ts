import { randomBytes, randomInt } from 'crypto';
import { ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, normalizeAccessCode } from './accessCode';

export type PairingStatus = 'pending' | 'consumed' | 'expired' | 'not_found';

interface PairingRecord {
  id: string;
  userId: string;
  code: string;
  status: 'pending' | 'consumed';
  expiresAt: number;
}

const PAIRING_TTL_MS = 2 * 60 * 1000;
// Janela pra o polling do dispositivo de origem ainda enxergar "consumed" antes
// do registro sumir.
const CONSUMED_RETENTION_MS = 10 * 1000;

// Em memória, mesmo padrão de rateLimit.ts/presence.ts — o app roda num
// processo único (Railway, sem Redis, ver rtc-infra-constraints). Um restart
// no meio de uma janela de 2min só derruba o pareamento em andamento; o
// usuário gera um código novo, sem risco de segurança.
//
// Três índices porque o mesmo pareamento é alcançado por três chaves: o `id`
// (que o QR carrega), o `code` (que a pessoa digita) e o `userId` (pra derrubar
// o pareamento anterior de quem gera outro — ver createPairing). Um pareamento
// entra e sai dos três juntos; `forget` existe pra que isso não dependa de
// alguém lembrar dos três em cada ponto de saída.
//
// EM globalThis, e não em variável de módulo: o HMR do Next reseta variável de
// módulo a cada reload. Em produção dá na mesma — o processo é longo e não
// recarrega —, mas em desenvolvimento qualquer arquivo salvo entre gerar o
// código e digitá-lo esvaziava os três índices, e o código voltava "inválido
// ou expirado" sem ter expirado de verdade.
const GLOBAL_KEY = '__opencallDevicePairing__';
const cache = globalThis as unknown as {
  [GLOBAL_KEY]?: {
    pairings: Map<string, PairingRecord>;
    idByCode: Map<string, string>;
    idByUser: Map<string, string>;
  };
};

const store = (cache[GLOBAL_KEY] ??= {
  pairings: new Map<string, PairingRecord>(),
  idByCode: new Map<string, string>(),
  idByUser: new Map<string, string>(),
});

const { pairings, idByCode, idByUser } = store;

function forget(record: PairingRecord): void {
  pairings.delete(record.id);
  idByCode.delete(record.code);
  if (idByUser.get(record.userId) === record.id) idByUser.delete(record.userId);
}

function isExpired(record: PairingRecord): boolean {
  return Date.now() > record.expiresAt;
}

/**
 * `randomInt` em vez de `randomBytes` % 32: o módulo enviesaria os primeiros
 * símbolos do alfabeto (256 não é múltiplo de 32 pra qualquer alfabeto, e aqui
 * seria por sorte), e um código curto não tem entropia sobrando pra doar.
 */
function generateCode(): string {
  let code = '';
  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

function generateUniqueCode(): string {
  // Colisão entre dois pareamentos vivos é improvável (poucos vivos por vez num
  // espaço de 2^30), mas o custo de checar é um lookup em Map — e uma colisão
  // silenciosa entregaria a sessão da pessoa errada, que é o pior desfecho
  // possível deste arquivo.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    if (!idByCode.has(code)) return code;
  }
  throw new Error('ACCESS_CODE_COLLISION');
}

/**
 * Um pareamento vivo por usuário: gerar um código novo mata o anterior. É o que
 * mantém a superfície de adivinhação no mínimo (um código vivo por pessoa, por
 * 2 minutos) e é também o que a tela promete — o código visível é *o* código.
 */
export function createPairing(userId: string): { id: string; code: string; expiresAt: number } {
  const previousId = idByUser.get(userId);
  const previous = previousId ? pairings.get(previousId) : undefined;
  if (previous) forget(previous);

  const id = randomBytes(24).toString('base64url');
  const code = generateUniqueCode();
  const expiresAt = Date.now() + PAIRING_TTL_MS;

  pairings.set(id, { id, userId, code, status: 'pending', expiresAt });
  idByCode.set(code, id);
  idByUser.set(userId, id);

  return { id, code, expiresAt };
}

export function getPairingStatus(id: string): PairingStatus {
  const record = pairings.get(id);
  if (!record) return 'not_found';
  if (isExpired(record)) {
    forget(record);
    return 'expired';
  }
  return record.status;
}

/**
 * Sem await entre o get e o set — não há corrida entre duas requests
 * concorrentes tentando consumir o mesmo pareamento nesse processo único.
 *
 * O registro sai dos índices de busca na hora (ninguém mais alcança o código
 * nem o id), mas continua em `pairings` por CONSUMED_RETENTION_MS pra o polling
 * da origem conseguir ler `consumed` uma última vez.
 */
function consume(record: PairingRecord): { userId: string } | null {
  if (isExpired(record)) {
    forget(record);
    return null;
  }
  if (record.status === 'consumed') return null;

  record.status = 'consumed';
  idByCode.delete(record.code);
  if (idByUser.get(record.userId) === record.id) idByUser.delete(record.userId);
  setTimeout(() => pairings.delete(record.id), CONSUMED_RETENTION_MS);

  return { userId: record.userId };
}

/** Transporte QR: a autoridade é possuir o `id` de 192 bits que só existe dentro do código lido. */
export function consumePairing(id: string): { userId: string } | null {
  const record = pairings.get(id);
  if (!record) return null;
  return consume(record);
}

/**
 * Transporte digitado. Aqui o código É a credencial — quem o lê da tela entra —
 * e é essa a diferença em relação ao `id` do QR, que ninguém consegue decorar.
 * O que segura a diferença de tamanho (2^30 contra 192 bits):
 *
 * - TTL de 2 minutos, e um único código vivo por usuário (createPairing);
 * - uso único, com o código saindo do índice na primeira tentativa certa;
 * - rate limit por IP na rota que chama isto (ver api/auth/qr/code).
 *
 * A conta: ~1 código vivo num espaço de 2^30 dá 1e-9 de chance por tentativa, e
 * o rate limit corta a tentativa em dezenas por IP a cada janela. O que **não**
 * está coberto é ler o código por cima do ombro ou numa gravação de tela — daí
 * ele nunca aparecer em log (nem aqui nem na rota) e a janela ser curta.
 */
export function consumePairingCode(rawCode: string): { userId: string } | null {
  const code = normalizeAccessCode(rawCode);
  if (code.length !== ACCESS_CODE_LENGTH) return null;

  const id = idByCode.get(code);
  if (!id) return null;

  const record = pairings.get(id);
  if (!record) return null;
  return consume(record);
}
