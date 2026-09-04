'use client';
import { useTranslations } from 'next-intl';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { GroupDTO } from '@/app/api/groups/types';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';
import type { AdminInviteDTO } from '@/app/api/admin/invites/types';
import type { StreamSettings } from '@/lib/rtc/streamQuality';
import type { MetricsSeries } from '@/lib/metrics/series';
import type { ForecastResult } from '@/lib/metrics/forecast';
import AdminUsersView from './users/AdminUsersView';
import AdminGroupsView from './groups/AdminGroupsView';
import AdminChannelsView from './channels/AdminChannelsView';
import AdminInvitesView from './invites/AdminInvitesView';
import AdminStreamView from './stream/AdminStreamView';
import AdminInfraView from './infra/AdminInfraView';

export default function AdminTabsView({
  groups,
  users,
  channels,
  invites,
  streamSettings,
  metricsSeries,
  forecast,
  currentUserId,
  currentUserIsAdmin,
  currentUserIsChannelsAdmin,
}: {
  groups: GroupDTO[];
  users: AdminUserDTO[];
  channels: AdminChannelDTO[];
  invites: AdminInviteDTO[];
  streamSettings: StreamSettings;
  // null quando a instalação não tem VPS própria (ver INFRA_ENABLED em
  // flows/admin/index.tsx) — a aba Infra não faz sentido sem self-host do
  // LiveKit, então nem os dados são buscados nesse caso.
  metricsSeries: MetricsSeries | null;
  forecast: ForecastResult | null;
  currentUserId?: string;
  currentUserIsAdmin: boolean;
  currentUserIsChannelsAdmin: boolean;
}) {
  const t = useTranslations('admin.tabs');
  const infraEnabled = metricsSeries !== null && forecast !== null;
  // Grupos e Transmissão continuam ADMIN-only — um CHANNELS_ACCESS puro (sem
  // ADMIN) só vê Usuários e Canais (que já mostra Admin de canais + Acesso ao
  // canais de voz juntos, e agora também criar/excluir canal — ver D5/ADR-0005).
  // Qualidade mexe em custo de banda do servidor, então fica no mesmo nível de
  // Grupos, não no de moderação de canal.
  if (!currentUserIsAdmin && currentUserIsChannelsAdmin) {
    return (
      <Tabs defaultValue="users" className="flex flex-1 flex-col">
        <TabsList className="mx-auto mt-6">
          <TabsTrigger value="users">{t('users')}</TabsTrigger>
          <TabsTrigger value="channels">{t('channels')}</TabsTrigger>
          <TabsTrigger value="invites">{t('invites')}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="flex flex-1 flex-col">
          <AdminUsersView users={users} currentUserId={currentUserId} currentUserIsAdmin={currentUserIsAdmin} />
        </TabsContent>

        <TabsContent value="channels" className="flex flex-1 flex-col">
          <AdminChannelsView channels={channels} />
        </TabsContent>

        <TabsContent value="invites" className="flex flex-1 flex-col">
          <AdminInvitesView invites={invites} />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <Tabs defaultValue="users" className="flex flex-1 flex-col">
      <TabsList className="mx-auto mt-6">
        <TabsTrigger value="users">{t('users')}</TabsTrigger>
        <TabsTrigger value="channels">{t('channels')}</TabsTrigger>
        <TabsTrigger value="invites">{t('invites')}</TabsTrigger>
        <TabsTrigger value="groups">{t('groups')}</TabsTrigger>
        <TabsTrigger value="stream">{t('stream')}</TabsTrigger>
        {infraEnabled && <TabsTrigger value="infra">{t('infra')}</TabsTrigger>}
      </TabsList>

      <TabsContent value="users" className="flex flex-1 flex-col">
        <AdminUsersView users={users} currentUserId={currentUserId} currentUserIsAdmin={currentUserIsAdmin} />
      </TabsContent>

      <TabsContent value="channels" className="flex flex-1 flex-col">
        <AdminChannelsView channels={channels} />
      </TabsContent>

      <TabsContent value="invites" className="flex flex-1 flex-col">
        <AdminInvitesView invites={invites} />
      </TabsContent>

      <TabsContent value="groups" className="flex flex-1 flex-col">
        <AdminGroupsView groups={groups} users={users} />
      </TabsContent>

      <TabsContent value="stream" className="flex flex-1 flex-col">
        <AdminStreamView settings={streamSettings} />
      </TabsContent>

      {metricsSeries && forecast && (
        <TabsContent value="infra" className="flex flex-1 flex-col">
          <AdminInfraView initialSeries={metricsSeries} initialForecast={forecast} />
        </TabsContent>
      )}
    </Tabs>
  );
}

/**
 * Placeholder da carga no host CLIENT (o modal de Configurações), onde os dados
 * chegam por fetch e não descem prontos do servidor. Skeleton e não spinner: a
 * barra de abas e o corpo já nascem no lugar em que vão ficar, então a aba não
 * salta quando o fetch volta.
 */
export function AdminTabsViewSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="mx-auto flex gap-1 rounded-lg bg-muted p-1">
        {[64, 56, 64, 72].map((width) => (
          <div key={width} className="h-8 animate-pulse rounded-md bg-muted-foreground/15" style={{ width }} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
