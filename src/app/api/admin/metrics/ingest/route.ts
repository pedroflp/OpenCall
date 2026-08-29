import { prisma } from '@/services/prisma';
import { isValidMetricsSecret } from '@/lib/metrics/ingestAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface IngestBody {
  capturedAt: string;
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  netRxBytes: string;
  netTxBytes: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseBigInt(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

function parseBody(raw: unknown): IngestBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<IngestBody>;

  if (typeof b.capturedAt !== 'string' || Number.isNaN(Date.parse(b.capturedAt))) return null;
  if (!isFiniteNumber(b.cpuPercent) || !isFiniteNumber(b.ramUsedMb) || !isFiniteNumber(b.ramTotalMb)) return null;
  if (!isFiniteNumber(b.diskUsedGb) || !isFiniteNumber(b.diskTotalGb)) return null;
  if (!parseBigInt(b.netRxBytes) || !parseBigInt(b.netTxBytes)) return null;

  return b as IngestBody;
}

/**
 * Ingestão do coletor horário rodando na VPS (ver
 * infra/vps-metrics/collect-local.sh) — sem sessão, autenticado por secret
 * compartilhado. Fora do gate de admin no middleware pelo mesmo motivo do
 * webhook do LiveKit (ver METRICS_INGEST_MATCHER em middleware.ts).
 */
export async function POST(req: Request) {
  if (!isValidMetricsSecret(req)) return new Response('unauthorized', { status: 401 });

  const raw = await req.json().catch(() => null);
  const body = parseBody(raw);
  if (!body) return new Response('invalid body', { status: 400 });

  await prisma.serverMetricSnapshot.create({
    data: {
      capturedAt: new Date(body.capturedAt),
      cpuPercent: body.cpuPercent,
      ramUsedMb: body.ramUsedMb,
      ramTotalMb: body.ramTotalMb,
      diskUsedGb: body.diskUsedGb,
      diskTotalGb: body.diskTotalGb,
      netRxBytes: BigInt(body.netRxBytes),
      netTxBytes: BigInt(body.netTxBytes),
    },
  });

  return new Response(null, { status: 204 });
}
