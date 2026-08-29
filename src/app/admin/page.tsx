import { redirect } from 'next/navigation'
import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth'
import { routeNames } from '@/app/route.names'

// /admin não tem UI própria — o middleware já redireciona pra /admin/channels
// (hoje a única área existente). Este componente é só o fallback caso a
// página seja alcançada sem passar pelo middleware.
export default async function AdminPage() {
  const canAccessAdmin = await isCurrentUserChannelsAdmin()
  if (!canAccessAdmin) redirect(routeNames.HOME)

  redirect(routeNames.ADMIN_CHANNELS)
}
