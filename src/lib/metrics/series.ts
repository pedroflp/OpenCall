import { prisma } from '@/services/prisma';

export type MetricsRange = 'hour' | 'day' | 'week' | 'month';

export interface MetricPoint {
  bucket: Date;
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  netRxBytes: string;
  netTxBytes: string;
}

export interface MetricsSeries {
  range: MetricsRange;
  points: MetricPoint[];
  lastUpdatedAt: Date | null;
}

export function parseMetricsRange(value: string | null): MetricsRange | null {
  if (value === 'hour' || value === 'day' || value === 'week' || value === 'month') return value;
  return null;
}

// Série crua das últimas 48h — é a única granularidade em que "hora em hora"
// tem sentido; agregar por hora aqui seria só devolver a própria linha.
async function queryHourly(): Promise<MetricPoint[]> {
  const rows = await prisma.serverMetricSnapshot.findMany({
    where: { capturedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
    orderBy: { capturedAt: 'asc' },
  });

  return rows.map((row) => ({
    bucket: row.capturedAt,
    cpuPercent: row.cpuPercent,
    ramUsedMb: row.ramUsedMb,
    ramTotalMb: row.ramTotalMb,
    diskUsedGb: row.diskUsedGb,
    diskTotalGb: row.diskTotalGb,
    netRxBytes: row.netRxBytes.toString(),
    netTxBytes: row.netTxBytes.toString(),
  }));
}

const RANGE_WINDOW: Record<Exclude<MetricsRange, 'hour'>, { unit: 'day' | 'week' | 'month'; since: string }> = {
  day: { unit: 'day', since: '30 days' },
  week: { unit: 'week', since: '12 weeks' },
  month: { unit: 'month', since: '12 months' },
};

interface AggregatedRow {
  bucket: Date;
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  net_rx_bytes: string;
  net_tx_bytes: string;
}

async function queryAggregated(range: Exclude<MetricsRange, 'hour'>): Promise<MetricPoint[]> {
  const { unit, since } = RANGE_WINDOW[range];

  const rows = await prisma.$queryRaw<AggregatedRow[]>`
    SELECT
      date_trunc(${unit}, captured_at) AS bucket,
      AVG(cpu_percent) AS cpu_percent,
      AVG(ram_used_mb) AS ram_used_mb,
      AVG(ram_total_mb) AS ram_total_mb,
      AVG(disk_used_gb) AS disk_used_gb,
      AVG(disk_total_gb) AS disk_total_gb,
      SUM(net_rx_bytes) AS net_rx_bytes,
      SUM(net_tx_bytes) AS net_tx_bytes
    FROM server_metric_snapshots
    WHERE captured_at >= now() - ${since}::interval
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return rows.map((row) => ({
    bucket: row.bucket,
    cpuPercent: Number(row.cpu_percent),
    ramUsedMb: Number(row.ram_used_mb),
    ramTotalMb: Number(row.ram_total_mb),
    diskUsedGb: Number(row.disk_used_gb),
    diskTotalGb: Number(row.disk_total_gb),
    netRxBytes: row.net_rx_bytes.toString(),
    netTxBytes: row.net_tx_bytes.toString(),
  }));
}

export async function getMetricsSeries(range: MetricsRange): Promise<MetricsSeries> {
  const [points, latest] = await Promise.all([
    range === 'hour' ? queryHourly() : queryAggregated(range),
    prisma.serverMetricSnapshot.findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } }),
  ]);
  return { range, points, lastUpdatedAt: latest?.capturedAt ?? null };
}
