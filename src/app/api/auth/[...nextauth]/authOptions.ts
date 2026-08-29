import { AuthOptions } from "next-auth"
import DiscordProvider from "next-auth/providers/discord"
import { prisma } from "@/services/prisma"
import { UserRoles } from "@/app/api/user/types"
import { hasCanalAccess, hasChannelsAdminAccess, mapPrismaRoles, rolesCacheInvalidatedAfter } from "@/lib/access"

/** Evita reler o Postgres em toda checagem de sessão — só quando o cache expira. */
const ROLES_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * IDs de usuário do Discord que, no primeiro login, já entram com role ADMIN —
 * resolve o problema de ovo-e-galinha de uma instalação nova (ninguém tem
 * ADMIN pra conceder ADMIN a alguém via /admin/channels). Só importa na
 * criação do usuário (upsert abaixo): depois do primeiro login de cada ID
 * listado, a env var pode ser removida sem efeito nenhum em quem já foi
 * promovido. Ver docs/opencall/README.md (gap de bootstrap do admin).
 */
function isBootstrapAdmin(discordId: string): boolean {
  const ids = process.env.BOOTSTRAP_ADMIN_DISCORD_IDS?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  return ids.includes(discordId);
}

export const authOptions: AuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds email',
        },
      },
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'discord') return true;

      const discordId = user.id;
      const username = user.name ?? '';
      const avatar = user.image ?? '';

      try {
        // upsert: cria com os defaults do schema (roles=[], etc.) na primeira
        // vez, ou só sincroniza username/avatar do Discord depois. Um usuário
        // listado em BOOTSTRAP_ADMIN_DISCORD_IDS entra com roles: [ADMIN] já
        // na criação — updates seguintes não mexem em roles.
        const existing = await prisma.user.findUnique({ where: { id: discordId }, select: { id: true } });

        await prisma.user.upsert({
          where: { id: discordId },
          create: {
            id: discordId,
            email: `${discordId}@opencall.local`,
            avatar,
            username,
            roles: !existing && isBootstrapAdmin(discordId) ? ['ADMIN'] : [],
          },
          update: { username, avatar },
        });
      } catch (error) {
        console.error('[signIn] Postgres sync error:', error);
        return false;
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (user) {
        token.id = user.id;
        token.username = user.name ?? undefined;
        token.avatar = user.image ?? undefined;
        token.email = user.email;
      }
      // O callback jwt roda em toda checagem de sessão (getServerSession,
      // useSession, e principalmente o heartbeat de presença a cada 20s por
      // aba aberta). O cache evita 1 query no Postgres por checagem.
      const rolesStale =
        !token.rolesFetchedAt ||
        Date.now() - token.rolesFetchedAt > ROLES_CACHE_TTL_MS ||
        (Boolean(token.id) && rolesCacheInvalidatedAfter(token.id as string, token.rolesFetchedAt ?? 0));
      if (token.id && (account || rolesStale)) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: token.id as string }, select: { roles: true } });
          const roles = dbUser ? mapPrismaRoles(dbUser.roles) : undefined;
          token.canalAccess = hasCanalAccess(roles);
          token.isAdmin = Boolean(roles?.includes(UserRoles.ADMIN));
          token.isChannelsAdmin = hasChannelsAdminAccess(roles);
          token.rolesFetchedAt = Date.now();
        } catch (err) {
          console.error('[jwt] fetch canalAccess failed:', err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      session.user.avatar = token.avatar as string;
      session.user.accessToken = token.accessToken as string;
      session.user.canalAccess = Boolean(token.canalAccess);
      session.user.isAdmin = Boolean(token.isAdmin);
      session.user.isChannelsAdmin = Boolean(token.isChannelsAdmin);
      return session;
    }
  }
}
