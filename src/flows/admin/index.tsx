import { auth } from '@/app/api/auth/[...nextauth]/auth';
import { getAdminGroups } from '@/app/api/admin/groups/actions';
import { getAdminUsers } from '@/app/api/admin/users/actions';
import { getStreamSettings } from '@/lib/rtc/channelsConfig';
import { getMetricsSeries } from '@/lib/metrics/series';
import { computeForecast } from '@/lib/metrics/forecast';
import AdminTabsView from './AdminTabsView';

// A aba Infra só faz sentido quando a instalação faz self-host da VPS do
// LiveKit (ver docs/opencall/01-guia-de-migracao.md, seção 2) — sem isso não
// há VPS pra monitorar, e ServerMetricSnapshot fica sempre vazia. VPS_SSH_HOST
// é a mesma env var que já é obrigatória pro botão de refresh via SSH, então
// serve de sinal de "essa instalação tem VPS própria" sem precisar de uma
// flag nova.
const INFRA_ENABLED = Boolean(process.env.VPS_SSH_HOST);

export default async function AdminChannelsPageFlow() {
  // currentUser vem da sessão (isAdmin/isChannelsAdmin já resolvidos no jwt de
  // authOptions.ts) — sem isso era mais uma query no Postgres só pra repetir o
  // que o page.tsx acima já tinha checado.
  const [groups, users, session, streamSettings, metricsSeries, forecast] = await Promise.all([
    getAdminGroups(),
    getAdminUsers(),
    auth(),
    getStreamSettings(),
    INFRA_ENABLED ? getMetricsSeries('day') : Promise.resolve(null),
    INFRA_ENABLED ? computeForecast() : Promise.resolve(null),
  ]);

  return (
    <AdminTabsView
      groups={groups}
      users={users}
      streamSettings={streamSettings}
      metricsSeries={metricsSeries}
      forecast={forecast}
      currentUserId={session?.user?.id}
      currentUserIsAdmin={Boolean(session?.user?.isAdmin)}
      currentUserIsChannelsAdmin={Boolean(session?.user?.isChannelsAdmin)}
    />
  );
}
