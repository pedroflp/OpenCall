import { cache } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "./authOptions"
import { UserAuthDTO } from "./types"

/**
 * Memoizado por request: quase toda rota chama getUser() e logo em seguida
 * isCurrentUserAdmin(), e cada getServerSession refaz o callback jwt inteiro —
 * que, quando o cache de roles do token expira, é uma query no Postgres. Sem
 * isso, um único POST /api/rtc/join resolvia a sessão duas vezes.
 */
export const auth = cache(async () => getServerSession(authOptions))

export async function getUser(): Promise<UserAuthDTO | null> {
  const session = await auth();
  if (!session?.user) return null;

  const { user } = session;
  return {
    id: user.id ?? '',
    username: user.username ?? '',
    avatar: user.avatar ?? '',
  } as UserAuthDTO;
}

/**
 * Lê isAdmin direto da sessão (já resolvido pelo callback jwt de authOptions.ts,
 * cacheado por 15min no token) em vez de bater no Postgres de novo — essa função
 * é chamada várias vezes por request (middleware não conta, ele já lê o token
 * cru) e cada chamada redundante ao Postgres era o principal motivo do /admin
 * demorar segundos pra abrir.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.isAdmin);
}

/** ADMIN sempre passa aqui também (já resolvido no isChannelsAdmin do jwt, ver hasChannelsAdminAccess em authOptions.ts). Mesmo motivo da isCurrentUserAdmin acima: lê da sessão, não do Postgres. */
export async function isCurrentUserChannelsAdmin(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.isChannelsAdmin);
}

/** Mesmo gate de /channels e /api/rtc (middleware.ts) — usado nas páginas server component onde vale checar de novo além do redirect do middleware. */
export async function isCurrentUserCanalAccess(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.canalAccess);
}
