import { timingSafeEqual } from 'crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada`);
  return value;
}

/**
 * Autentica o coletor rodando na VPS (ver infra/vps-metrics/) — sem sessão,
 * comparação em tempo constante pra não vazar o secret por timing.
 */
export function isValidMetricsSecret(req: Request): boolean {
  const provided = req.headers.get('x-metrics-secret');
  if (!provided) return false;

  const expected = requireEnv('SERVER_METRICS_INGEST_SECRET');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
