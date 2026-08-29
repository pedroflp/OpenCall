'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchMetricsSeries, refreshMetrics } from '@/app/api/admin/metrics/requests';
import type { MetricsRange, MetricsSeries } from '@/lib/metrics/series';
import type { ForecastResult } from '@/lib/metrics/forecast';

const RANGE_OPTIONS: { value: MetricsRange; label: string }[] = [
  { value: 'hour', label: 'Hora' },
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const BYTES_PER_GB = 1_000_000_000;
const BYTES_PER_MB = 1_000_000;

function bucketLabel(range: MetricsRange, date: Date): string {
  if (range === 'hour') return format(date, 'HH:mm');
  if (range === 'day') return format(date, 'dd/MM');
  if (range === 'week') return `sem. ${format(date, 'dd/MM')}`;
  return format(date, 'MMM/yy', { locale: ptBR });
}

interface ChartRow {
  time: string;
  cpuPercent: number;
  ramUsedMb: number;
  diskUsedGb: number;
  netRxMb: number;
  netTxMb: number;
}

function toChartRows(series: MetricsSeries): ChartRow[] {
  return series.points.map((point) => ({
    time: bucketLabel(series.range, new Date(point.bucket)),
    cpuPercent: Math.round(point.cpuPercent * 10) / 10,
    ramUsedMb: Math.round(point.ramUsedMb),
    diskUsedGb: Math.round(point.diskUsedGb * 10) / 10,
    netRxMb: Math.round(Number(point.netRxBytes) / BYTES_PER_MB),
    netTxMb: Math.round(Number(point.netTxBytes) / BYTES_PER_MB),
  }));
}

// Cores validadas (CVD-safe) em src/app/globals.css — ver skill dataviz.
const CPU_CONFIG = { cpuPercent: { label: 'CPU %', color: 'hsl(var(--chart-cpu))' } } satisfies ChartConfig;
const RAM_CONFIG = { ramUsedMb: { label: 'RAM usada (MB)', color: 'hsl(var(--chart-ram))' } } satisfies ChartConfig;
const DISK_CONFIG = { diskUsedGb: { label: 'Disco usado (GB)', color: 'hsl(var(--chart-disk))' } } satisfies ChartConfig;
const NET_CONFIG = {
  netRxMb: { label: 'Download (MB)', color: 'hsl(var(--chart-net-rx))' },
  netTxMb: { label: 'Upload (MB)', color: 'hsl(var(--chart-net-tx))' },
} satisfies ChartConfig;

function MetricAreaChart({
  title,
  data,
  config,
  dataKeys,
}: {
  title: string;
  data: ChartRow[];
  config: ChartConfig;
  dataKeys: (keyof ChartRow)[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Sem dados ainda — o coletor da VPS ainda não mandou nada nesse período.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-40 w-full">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <YAxis width={40} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {dataKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              {dataKeys.map((key) => (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  fill={`var(--color-${key})`}
                  fillOpacity={0.15}
                  stroke={`var(--color-${key})`}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastResult }) {
  if (!forecast.available || !forecast.plan || !forecast.bandwidth) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Previsão de custo</CardTitle>
          <CardDescription>
            Ainda sem dados do plano — assim que o coletor rodar na VPS pela primeira vez, a previsão aparece aqui.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { plan, bandwidth, projectedTotalCostUsd, recommendations } = forecast;
  const usedGb = Number(bandwidth.monthToDateBytes) / BYTES_PER_GB;
  const projectedGb = Number(bandwidth.projectedMonthEndBytes) / BYTES_PER_GB;
  const usedPercent = Math.min(100, (usedGb / plan.bandwidthQuotaGb) * 100);
  const overshooting = bandwidth.projectedOverageGb > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Previsão de custo</CardTitle>
        <CardDescription>
          Plano {plan.planId} · {plan.vcpuCount} vCPU · {plan.ramMb}MB RAM · {plan.diskGb}GB disco · {plan.region} · US$
          {plan.monthlyCostUsd.toFixed(2)}/mês
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>
              Banda do mês: <span className="font-medium">{usedGb.toFixed(1)}GB</span> de {plan.bandwidthQuotaGb}GB
            </span>
            <span className="text-muted-foreground">{usedPercent.toFixed(0)}%</span>
          </div>
          <Progress value={usedPercent} className={cn(overshooting && '[&>div]:bg-destructive')} />
          <p className="text-xs text-muted-foreground">
            Projeção pro fim do mês: ~{projectedGb.toFixed(0)}GB ({bandwidth.daysRemaining} dias restantes, com base na
            média dos últimos dias)
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
          <span>Custo projetado este mês</span>
          <span className="font-semibold">US${(projectedTotalCostUsd ?? plan.monthlyCostUsd).toFixed(2)}</span>
        </div>

        {recommendations.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {recommendations.map((rec) => (
              <li key={rec} className="rounded-lg border border-dashed border-destructive/40 p-2.5 text-xs text-destructive">
                {rec}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Consumo dentro do esperado — sem sinal de upgrade necessário.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminInfraView({
  initialSeries,
  initialForecast,
}: {
  initialSeries: MetricsSeries;
  initialForecast: ForecastResult;
}) {
  const [series, setSeries] = useState(initialSeries);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  async function handleRangeChange(range: MetricsRange) {
    if (range === series.range) return;
    setLoading(true);
    const next = await fetchMetricsSeries(range);
    if (next) setSeries(next);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    const next = await refreshMetrics(series.range);
    if (next) {
      setSeries(next);
    } else {
      toast({
        title: 'Não deu pra atualizar',
        description: 'Falha ao coletar os dados agora da VPS via SSH. Tenta de novo em instantes.',
        variant: 'destructive',
      });
    }
    setRefreshing(false);
  }

  const data = toChartRows(series);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Infra</h1>
          <p className="text-sm text-muted-foreground">Consumo da VPS do LiveKit e previsão de custo.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm transition-colors hover:border-border disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Coletando...' : 'Atualizar'}
          </button>
          {series.lastUpdatedAt && (
            <span className="text-xs text-muted-foreground">
              Atualizado em: {format(new Date(series.lastUpdatedAt), 'dd/MM/yy HH:mm')}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={loading}
            aria-pressed={series.range === option.value}
            onClick={() => handleRangeChange(option.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              series.range === option.value
                ? 'border-primary bg-primary/5 font-medium'
                : 'border-border/60 hover:border-border',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricAreaChart title="CPU" data={data} config={CPU_CONFIG} dataKeys={['cpuPercent']} />
        <MetricAreaChart title="RAM" data={data} config={RAM_CONFIG} dataKeys={['ramUsedMb']} />
        <MetricAreaChart title="Disco" data={data} config={DISK_CONFIG} dataKeys={['diskUsedGb']} />
        <MetricAreaChart title="Banda" data={data} config={NET_CONFIG} dataKeys={['netRxMb', 'netTxMb']} />
      </div>

      <ForecastCard forecast={initialForecast} />
    </main>
  );
}
