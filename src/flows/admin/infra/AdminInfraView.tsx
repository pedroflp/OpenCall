'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/i18n/dateFns';
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

/** Só os VALORES — o rótulo de cada faixa vem de `admin.infra.ranges`. */
const RANGE_VALUES: MetricsRange[] = ['hour', 'day', 'week', 'month'];

const BYTES_PER_GB = 1_000_000_000;
const BYTES_PER_MB = 1_000_000;

/**
 * O rótulo do eixo X. `weekPrefix` e o locale entram por parâmetro porque o
 * "sem." é uma palavra (era fixa aqui) e o nome do mês do bucket mensal muda de
 * língua junto com o resto do painel.
 */
function bucketLabel(range: MetricsRange, date: Date, locale: DateFnsLocale, weekPrefix: (date: string) => string): string {
  if (range === 'hour') return format(date, 'HH:mm');
  if (range === 'day') return format(date, 'dd/MM');
  if (range === 'week') return weekPrefix(format(date, 'dd/MM'));
  return format(date, 'MMM/yy', { locale });
}

interface ChartRow {
  time: string;
  cpuPercent: number;
  ramUsedMb: number;
  diskUsedGb: number;
  netRxMb: number;
  netTxMb: number;
}

function toChartRows(series: MetricsSeries, locale: DateFnsLocale, weekPrefix: (date: string) => string): ChartRow[] {
  return series.points.map((point) => ({
    time: bucketLabel(series.range, new Date(point.bucket), locale, weekPrefix),
    cpuPercent: Math.round(point.cpuPercent * 10) / 10,
    ramUsedMb: Math.round(point.ramUsedMb),
    diskUsedGb: Math.round(point.diskUsedGb * 10) / 10,
    netRxMb: Math.round(Number(point.netRxBytes) / BYTES_PER_MB),
    netTxMb: Math.round(Number(point.netTxBytes) / BYTES_PER_MB),
  }));
}

/**
 * Cores validadas (CVD-safe) em src/app/globals.css — ver skill dataviz.
 *
 * Virou função porque o `label` de cada série aparece na legenda e no tooltip
 * do gráfico: é texto de tela, e sai do catálogo como o resto. As CORES
 * continuam fixas — não têm língua.
 */
type InfraTranslator = ReturnType<typeof useTranslations<'admin.infra'>>;

function chartConfigs(t: InfraTranslator) {
  return {
    cpu: { cpuPercent: { label: t('charts.cpuPercent'), color: 'hsl(var(--chart-cpu))' } } satisfies ChartConfig,
    ram: { ramUsedMb: { label: t('charts.ramUsedMb'), color: 'hsl(var(--chart-ram))' } } satisfies ChartConfig,
    disk: { diskUsedGb: { label: t('charts.diskUsedGb'), color: 'hsl(var(--chart-disk))' } } satisfies ChartConfig,
    net: {
      netRxMb: { label: t('charts.netRxMb'), color: 'hsl(var(--chart-net-rx))' },
      netTxMb: { label: t('charts.netTxMb'), color: 'hsl(var(--chart-net-tx))' },
    } satisfies ChartConfig,
  };
}

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
  const t = useTranslations('admin.infra');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {t('noData')}
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
  const t = useTranslations('admin.infra.forecast');

  if (!forecast.available || !forecast.plan || !forecast.bandwidth) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
          <CardDescription>{t('unavailable')}</CardDescription>
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
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>
          {t('planLine', {
            planId: plan.planId,
            vcpu: plan.vcpuCount,
            ramMb: plan.ramMb,
            diskGb: plan.diskGb,
            region: plan.region,
            cost: plan.monthlyCostUsd.toFixed(2),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>
              {t.rich('monthBandwidth', {
                usedGb: usedGb.toFixed(1),
                quota: plan.bandwidthQuotaGb,
                used: (chunks) => <span className="font-medium">{chunks}</span>,
              })}
            </span>
            <span className="text-muted-foreground">{usedPercent.toFixed(0)}%</span>
          </div>
          <Progress value={usedPercent} className={cn(overshooting && '[&>div]:bg-destructive')} />
          <p className="text-xs text-muted-foreground">
            {t('projection', { projected: projectedGb.toFixed(0), days: bandwidth.daysRemaining })}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
          <span>{t('projectedCost')}</span>
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
          <p className="text-xs text-muted-foreground">{t('healthy')}</p>
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
  const t = useTranslations('admin.infra');
  const dateFnsLocale = useDateFnsLocale();
  const configs = chartConfigs(t);
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
        title: t('refreshFailed'),
        description: t('refreshFailedDescription'),
        variant: 'destructive',
      });
    }
    setRefreshing(false);
  }

  const data = toChartRows(series, dateFnsLocale, (date) => t('weekBucket', { date }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm transition-colors hover:border-border disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            {refreshing ? t('collecting') : t('refresh')}
          </button>
          {series.lastUpdatedAt && (
            <span className="text-xs text-muted-foreground">
              {t('updatedAt', { when: format(new Date(series.lastUpdatedAt), 'dd/MM/yy HH:mm') })}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {RANGE_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={loading}
            aria-pressed={series.range === value}
            onClick={() => handleRangeChange(value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              series.range === value
                ? 'border-primary bg-primary/5 font-medium'
                : 'border-border/60 hover:border-border',
            )}
          >
            {t(`ranges.${value}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricAreaChart title={t('charts.cpu')} data={data} config={configs.cpu} dataKeys={['cpuPercent']} />
        <MetricAreaChart title={t('charts.ram')} data={data} config={configs.ram} dataKeys={['ramUsedMb']} />
        <MetricAreaChart title={t('charts.disk')} data={data} config={configs.disk} dataKeys={['diskUsedGb']} />
        <MetricAreaChart title={t('charts.bandwidth')} data={data} config={configs.net} dataKeys={['netRxMb', 'netTxMb']} />
      </div>

      <ForecastCard forecast={initialForecast} />
    </main>
  );
}
