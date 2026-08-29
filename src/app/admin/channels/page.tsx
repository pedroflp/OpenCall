import { redirect } from 'next/navigation'
import BaseLayout from '@/layouts/Base'
import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth'
import { routeNames } from '@/app/route.names'
import AdminChannelsPageFlow from '@/flows/admin'

export default async function AdminChannelsPage() {
  // isCurrentUserChannelsAdmin já cobre ADMIN também (ver hasChannelsAdminAccess)
  // — é o piso pra sequer carregar a página; cada aba interna decide o resto.
  const canAccessAdmin = await isCurrentUserChannelsAdmin()
  if (!canAccessAdmin) redirect(routeNames.HOME)

  return (
    <BaseLayout>
      <AdminChannelsPageFlow />
    </BaseLayout>
  )
}
