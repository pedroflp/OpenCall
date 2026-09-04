'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import AdminTabsView, { AdminTabsViewSkeleton } from '@/flows/admin/AdminTabsView';
import { AdminRefreshProvider } from '@/flows/admin/refresh';
import { fetchAdminUsers } from '@/app/api/admin/users/requests';
import { fetchAdminGroups } from '@/app/api/admin/groups/requests';
import { fetchAdminChannels } from '@/app/api/admin/channels/requests';
import { fetchAdminInvites } from '@/app/api/admin/invites/requests';
import { fetchStreamSettings } from '@/app/api/rtc/stream-config/requests';
import { fetchForecast, fetchMetricsSeries } from '@/app/api/admin/metrics/requests';
import { DEFAULT_STREAM_SETTINGS, type StreamSettings } from '@/lib/rtc/streamQuality';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';
import type { AdminInviteDTO } from '@/app/api/admin/invites/types';
import type { GroupDTO } from '@/app/api/groups/types';
import type { MetricsSeries } from '@/lib/metrics/series';
import type { ForecastResult } from '@/lib/metrics/forecast';

/**
 * A área de admin dentro do modal de Configurações.
 *
 * Renderiza o MESMO `AdminTabsView` da rota `/admin` — inclusive a regra de
 * quem vê o quê (um CHANNELS_ACCESS puro não alcança Infra nem Grupos), que
 * mora lá e não pode ser reescrita aqui. O que muda entre os dois hosts é só de
 * onde os dados vêm: na página eles descem prontos de Server Component; aqui,
 * num modal client, chegam pelas rotas de API — e é por isso que a recarga
 * depois de uma edição passa pelo `AdminRefreshProvider` em vez do refresh do
 * router que a página usa (ver flows/admin/refresh.tsx).
 *
 * A página `/admin` continua existindo: é o alvo do redirect do middleware e o
 * caminho de quem abre a URL direto no navegador.
 */

/** A série que o AdminInfraView abre por padrão — mesmo range que a página pede no servidor. */
const INITIAL_RANGE = 'day';

// Pra quem não é ADMIN completo a aba Infra nem é renderizada (ver
// AdminTabsView): a rota de métricas responde 403 e o fetch devolve null. `null`
// é o mesmo "sem VPS" que a página passa quando INFRA_ENABLED é falso, e é um
// estado que as views já sabem desenhar — não um valor inventado pra enganar o
// tipo.
interface AdminData {
  users: AdminUserDTO[];
  groups: GroupDTO[];
  channels: AdminChannelDTO[];
  invites: AdminInviteDTO[];
  streamSettings: StreamSettings;
  metricsSeries: MetricsSeries | null;
  forecast: ForecastResult | null;
}

export default function AdminTab({ active }: { active: boolean }) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const isChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);

  const [data, setData] = useState<AdminData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);

    // Em paralelo, como a página faz: são origens independentes, e em série a
    // aba abriria na soma dos round-trips. Grupos, transmissão e métricas são
    // ADMIN-only — pedir como CHANNELS_ACCESS puro só colheria 403, então nem
    // saem.
    const [users, groups, channels, invites, streamSettings, metricsSeries, forecast] = await Promise.all([
      fetchAdminUsers(),
      isAdmin ? fetchAdminGroups() : null,
      fetchAdminChannels(),
      fetchAdminInvites(),
      isAdmin ? fetchStreamSettings() : null,
      isAdmin ? fetchMetricsSeries(INITIAL_RANGE) : null,
      isAdmin ? fetchForecast() : null,
    ]);

    // Usuários é o piso: é a única aba que todo nível de admin enxerga, então
    // sem ela não há o que mostrar.
    if (!users) {
      setFailed(true);
      return;
    }

    setData({
      users,
      groups: groups ?? [],
      channels: channels ?? [],
      invites: invites ?? [],
      streamSettings: streamSettings ?? DEFAULT_STREAM_SETTINGS,
      metricsSeries,
      forecast,
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          {tCommon('retry')}
        </Button>
      </div>
    );
  }

  if (!data) return <AdminTabsViewSkeleton />;

  return (
    <AdminRefreshProvider onRefresh={() => void load()}>
      <AdminTabsView
        groups={data.groups}
        users={data.users}
        channels={data.channels}
        invites={data.invites}
        streamSettings={data.streamSettings}
        metricsSeries={data.metricsSeries}
        forecast={data.forecast}
        currentUserId={session?.user?.id}
        currentUserIsAdmin={isAdmin}
        currentUserIsChannelsAdmin={isChannelsAdmin}
      />
    </AdminRefreshProvider>
  );
}
