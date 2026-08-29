'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ConnectionQuality } from 'livekit-client';
import { Area, AreaChart, CartesianGrid, YAxis } from 'recharts';
import { HugeIcon } from '@/components/HugeIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { useConnectionQuality } from '@/hooks/useConnectionQuality';

const SIGNAL_ICON: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: 'full-signal',
  [ConnectionQuality.Good]: 'medium-signal',
  [ConnectionQuality.Poor]: 'low-signal',
  [ConnectionQuality.Lost]: 'no-signal',
  [ConnectionQuality.Unknown]: 'no-signal',
};

const PING_EXCELLENT_MAX_MS = 40;
const PING_GOOD_MAX_MS = 80;
const PING_OK_MAX_MS = 120;

function pingLabel(ms: number | null): string {
  if (ms === null) return 'Conectando…';
  if (ms <= PING_EXCELLENT_MAX_MS) return 'Excelente';
  if (ms <= PING_GOOD_MAX_MS) return 'Bom';
  if (ms <= PING_OK_MAX_MS) return 'Mediano';
  return 'Ruim';
}

function pingColorClass(ms: number | null): string {
  if (ms === null) return 'text-muted-foreground';
  if (ms <= PING_GOOD_MAX_MS) return 'text-emerald-500';
  if (ms <= PING_OK_MAX_MS) return 'text-yellow-500';
  return 'text-red-500';
}

function pingColorHex(ms: number | null): string {
  if (ms === null) return 'hsl(var(--muted-foreground))';
  if (ms <= PING_GOOD_MAX_MS) return '#10b981';
  if (ms <= PING_OK_MAX_MS) return '#eab308';
  return '#ef4444';
}

// Dado fake só pra desenhar uma linha tracejada de placeholder — nunca é
// mostrado como valor real (sem tooltip), é puro "carregando".
const MOCK_LOADING_DATA = [32, 40, 30, 44, 34, 42, 33].map((ping, i) => ({ i, ping }));

const mockChartConfig = {
  ping: { label: 'Ping', color: 'hsl(var(--muted-foreground))' },
} satisfies ChartConfig;

function PingHistoryChart({ history, ping }: { history: number[]; ping: number | null }) {
  const hasData = history.length >= 2;
  const data = hasData ? history.map((ping, i) => ({ i, ping })) : MOCK_LOADING_DATA;
  const pingChartConfig = { ping: { label: 'Ping', color: pingColorHex(ping) } } satisfies ChartConfig;

  return (
    <ChartContainer config={hasData ? pingChartConfig : mockChartConfig} className="aspect-auto h-20 w-full">
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <YAxis width={34} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
        <Area
          dataKey="ping"
          type="monotone"
          fill={hasData ? 'var(--color-ping)' : 'none'}
          fillOpacity={hasData ? 0.15 : 0}
          stroke="var(--color-ping)"
          strokeWidth={1.5}
          strokeDasharray={hasData ? undefined : '4 3'}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export default function ConnectionQualityIndicator({ children }: { children?: ReactNode }) {
  const { quality, ping, history } = useConnectionQuality();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const icon = SIGNAL_ICON[quality];
  const label = pingLabel(ping);
  const colorClass = pingColorClass(ping);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Qualidade da conexão: ${label}`}
          className="flex min-w-0 cursor-default items-start gap-2 rounded-md outline-none"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          onClick={(e) => e.preventDefault()}
        >
          <HugeIcon name={icon} size={18} className={cn('mt-0.5 shrink-0', colorClass)} />
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-56 space-y-3 border-0"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className='flex justify-between items-center'>
          <div className="flex items-center gap-2">
            <HugeIcon name={icon} size={16} className={colorClass} />
            <p className={cn('text-[13px] font-bold', colorClass)}>{label}</p>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Ping: <span className="font-semibold text-foreground">{ping !== null ? `${ping}ms` : '—'}</span>
          </p>
        </div>
        <PingHistoryChart history={history} ping={ping} />
      </PopoverContent>
    </Popover>
  );
}
