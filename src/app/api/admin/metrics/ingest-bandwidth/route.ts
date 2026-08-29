import { prisma } from '@/services/prisma';
import { isValidMetricsSecret } from '@/lib/metrics/ingestAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlanInfo {
  planId: string;
  region: string;
  vcpuCount: number;
  ramMb: number;
  diskGb: number;
  bandwidthQuotaGb: number;
  monthlyCostUsd: number;
}

interface IngestBandwidthBody {
  date: string; // YYYY-MM-DD, dia já fechado na Vultr
  incomingBytes: string;
  outgoingBytes: string;
  /** Opcional: mandado 1x/dia junto pelo mesmo script — ver ServerPlanInfo. */
  plan?: PlanInfo;
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

function parsePlan(raw: unknown): PlanInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PlanInfo>;

  if (typeof p.planId !== 'string' || typeof p.region !== 'string') return null;
  if (!isFiniteNumber(p.vcpuCount) || !isFiniteNumber(p.ramMb) || !isFiniteNumber(p.diskGb)) return null;
  if (!isFiniteNumber(p.bandwidthQuotaGb) || !isFiniteNumber(p.monthlyCostUsd)) return null;

  return p as PlanInfo;
}

function parseBody(raw: unknown): IngestBandwidthBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<IngestBandwidthBody>;

  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null;
  if (!parseBigInt(b.incomingBytes) || !parseBigInt(b.outgoingBytes)) return null;

  if (b.plan !== undefined) {
    const plan = parsePlan(b.plan);
    if (!plan) return null;
    return { date: b.date, incomingBytes: b.incomingBytes!, outgoingBytes: b.outgoingBytes!, plan };
  }

  return { date: b.date, incomingBytes: b.incomingBytes!, outgoingBytes: b.outgoingBytes! };
}

/**
 * Ingestão diária do bandwidth oficial da Vultr (ver
 * infra/vps-metrics/collect-bandwidth.sh) — upsert por data pra reexecução
 * do script não duplicar linha. Carrega os specs/custo do plano de carona
 * (campo `plan`, opcional) porque o mesmo script já chamou a Vultr API —
 * evita o Next.js/Railway precisar da VULTR_API_KEY (ver ServerPlanInfo).
 */
export async function POST(req: Request) {
  if (!isValidMetricsSecret(req)) return new Response('unauthorized', { status: 401 });

  const raw = await req.json().catch(() => null);
  const body = parseBody(raw);
  if (!body) return new Response('invalid body', { status: 400 });

  const date = new Date(`${body.date}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    await tx.serverBandwidthDaily.upsert({
      where: { date },
      create: { date, incomingBytes: BigInt(body.incomingBytes), outgoingBytes: BigInt(body.outgoingBytes) },
      update: { incomingBytes: BigInt(body.incomingBytes), outgoingBytes: BigInt(body.outgoingBytes) },
    });

    if (body.plan) {
      await tx.serverPlanInfo.upsert({
        where: { id: 1 },
        create: { id: 1, ...body.plan },
        update: { ...body.plan },
      });
    }
  });

  return new Response(null, { status: 204 });
}
