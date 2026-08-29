import { prisma } from '@/services/prisma';

// Documentado em docs/migração-self-host.md §5.1 — é o valor padrão da Vultr
// pra excedente de banda nos planos vhp. Não vem da API (não há campo pra
// isso em GET /v2/plans), por isso fica constante aqui em vez de guardado.
const OVERAGE_USD_PER_GB = 0.01;
const BYTES_PER_GB = 1_000_000_000;

const CPU_HIGH_THRESHOLD_PERCENT = 80;
const RAM_HIGH_THRESHOLD_PERCENT = 85;
const SUSTAINED_HIGH_USAGE_DAYS = 3;

interface PlanSnapshot {
  planId: string;
  region: string;
  vcpuCount: number;
  ramMb: number;
  diskGb: number;
  bandwidthQuotaGb: number;
  monthlyCostUsd: number;
}

interface BandwidthForecast {
  monthToDateBytes: string;
  projectedMonthEndBytes: string;
  quotaBytes: string;
  daysElapsed: number;
  daysRemaining: number;
  projectedOverageGb: number;
  projectedOverageCostUsd: number;
}

interface UsageSignal {
  p95Percent: number;
  highUsageDays: number;
}

export interface ForecastResult {
  available: boolean;
  plan: PlanSnapshot | null;
  bandwidth: BandwidthForecast | null;
  projectedTotalCostUsd: number | null;
  cpu: UsageSignal | null;
  ram: UsageSignal | null;
  recommendations: string[];
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[index];
}

// Vultr não expõe a data de fechamento da fatura por API — mês calendário é
// a aproximação razoável (a franquia de banda da Vultr já reseta por mês).
function currentMonthRange(now: Date): { start: Date; daysElapsed: number; daysRemaining: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = now.getUTCDate();
  return { start, daysElapsed, daysRemaining: daysInMonth - daysElapsed };
}

async function forecastBandwidth(plan: PlanSnapshot, now: Date): Promise<BandwidthForecast> {
  const { start, daysElapsed, daysRemaining } = currentMonthRange(now);

  const daysThisMonth = await prisma.serverBandwidthDaily.findMany({
    where: { date: { gte: start, lte: now } },
    orderBy: { date: 'asc' },
  });

  const monthToDateBytes = daysThisMonth.reduce(
    (sum, day) => sum + day.incomingBytes + day.outgoingBytes,
    BigInt(0),
  );

  // Média dos últimos 7 dias fechados (ou o que existir) pra projetar o
  // resto do mês — reage mais rápido a uma mudança de padrão de uso do que
  // usar a média do mês inteiro.
  const recentDays = daysThisMonth.slice(-7);
  const recentAvgBytes =
    recentDays.length > 0
      ? recentDays.reduce((sum, day) => sum + day.incomingBytes + day.outgoingBytes, BigInt(0)) /
        BigInt(recentDays.length)
      : BigInt(0);

  const projectedMonthEndBytes = monthToDateBytes + recentAvgBytes * BigInt(Math.max(0, daysRemaining));
  const quotaBytes = BigInt(plan.bandwidthQuotaGb) * BigInt(BYTES_PER_GB);

  const overageBytes = projectedMonthEndBytes > quotaBytes ? projectedMonthEndBytes - quotaBytes : BigInt(0);
  const projectedOverageGb = Number(overageBytes) / BYTES_PER_GB;
  const projectedOverageCostUsd = projectedOverageGb * OVERAGE_USD_PER_GB;

  return {
    monthToDateBytes: monthToDateBytes.toString(),
    projectedMonthEndBytes: projectedMonthEndBytes.toString(),
    quotaBytes: quotaBytes.toString(),
    daysElapsed,
    daysRemaining,
    projectedOverageGb,
    projectedOverageCostUsd,
  };
}

async function usageSignal(field: 'cpuPercent' | 'ramRatio'): Promise<UsageSignal> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.serverMetricSnapshot.findMany({
    where: { capturedAt: { gte: since } },
    select: { capturedAt: true, cpuPercent: true, ramUsedMb: true, ramTotalMb: true },
    orderBy: { capturedAt: 'asc' },
  });

  const values = rows.map((row) => (field === 'cpuPercent' ? row.cpuPercent : (row.ramUsedMb / row.ramTotalMb) * 100));
  const threshold = field === 'cpuPercent' ? CPU_HIGH_THRESHOLD_PERCENT : RAM_HIGH_THRESHOLD_PERCENT;

  const maxByDay = new Map<string, number>();
  rows.forEach((row, i) => {
    const day = row.capturedAt.toISOString().slice(0, 10);
    maxByDay.set(day, Math.max(maxByDay.get(day) ?? 0, values[i]));
  });

  const highUsageDays = Array.from(maxByDay.values()).filter((max) => max > threshold).length;
  const sorted = [...values].sort((a, b) => a - b);

  return { p95Percent: percentile(sorted, 0.95), highUsageDays };
}

export async function computeForecast(now: Date = new Date()): Promise<ForecastResult> {
  const plan = await prisma.serverPlanInfo.findUnique({ where: { id: 1 } });
  if (!plan) {
    return { available: false, plan: null, bandwidth: null, projectedTotalCostUsd: null, cpu: null, ram: null, recommendations: [] };
  }

  const planSnapshot: PlanSnapshot = {
    planId: plan.planId,
    region: plan.region,
    vcpuCount: plan.vcpuCount,
    ramMb: plan.ramMb,
    diskGb: plan.diskGb,
    bandwidthQuotaGb: plan.bandwidthQuotaGb,
    monthlyCostUsd: plan.monthlyCostUsd,
  };

  const [bandwidth, cpu, ram] = await Promise.all([
    forecastBandwidth(planSnapshot, now),
    usageSignal('cpuPercent'),
    usageSignal('ramRatio'),
  ]);

  const recommendations: string[] = [];
  if (bandwidth.projectedOverageGb > 0) {
    recommendations.push(
      `Projeção de banda estoura a franquia em ~${bandwidth.projectedOverageGb.toFixed(1)}GB este mês (~US$${bandwidth.projectedOverageCostUsd.toFixed(2)} de excedente) — considere upgrade de banda ou de plano.`,
    );
  }
  if (cpu.highUsageDays >= SUSTAINED_HIGH_USAGE_DAYS) {
    recommendations.push(
      `CPU passou de ${CPU_HIGH_THRESHOLD_PERCENT}% em ${cpu.highUsageDays} dos últimos 7 dias — considere upgrade de vCPU.`,
    );
  }
  if (ram.highUsageDays >= SUSTAINED_HIGH_USAGE_DAYS) {
    recommendations.push(
      `RAM passou de ${RAM_HIGH_THRESHOLD_PERCENT}% em ${ram.highUsageDays} dos últimos 7 dias — considere upgrade de memória.`,
    );
  }

  return {
    available: true,
    plan: planSnapshot,
    bandwidth,
    projectedTotalCostUsd: planSnapshot.monthlyCostUsd + bandwidth.projectedOverageCostUsd,
    cpu,
    ram,
    recommendations,
  };
}
