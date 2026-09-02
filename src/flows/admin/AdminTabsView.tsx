'use client';

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
  const infraEnabled = metricsSeries !== null && forecast !== null;
  // Grupos e Transmissão continuam ADMIN-only — um CHANNELS_ACCESS puro (sem
  // ADMIN) só vê Usuários e Canais (que já mostra Admin de canais + Acesso ao
  // TDCalls juntos, e agora também criar/arquivar canal — ver D5/ADR-0005).
  // Qualidade mexe em custo de banda do servidor, então fica no mesmo nível de
  // Grupos, não no de moderação de canal.
  if (!currentUserIsAdmin && currentUserIsChannelsAdmin) {
    return (
      <Tabs defaultValue="users" className="flex flex-1 flex-col">
        <TabsList className="mx-auto mt-6">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="channels">Canais</TabsTrigger>
          <TabsTrigger value="invites">Convites</TabsTrigger>
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
        <TabsTrigger value="users">Usuários</TabsTrigger>
        <TabsTrigger value="channels">Canais</TabsTrigger>
        <TabsTrigger value="invites">Convites</TabsTrigger>
        <TabsTrigger value="groups">Grupos</TabsTrigger>
        <TabsTrigger value="stream">Transmissão</TabsTrigger>
        {infraEnabled && <TabsTrigger value="infra">Infra</TabsTrigger>}
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
