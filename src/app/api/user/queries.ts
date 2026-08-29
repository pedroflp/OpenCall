import { prisma } from "@/services/prisma";
import { mapPrismaRoles } from "@/lib/access";
import type { UserDTO, ChannelPreferences } from "./types";

/**
 * Fonte única do UserDTO, compartilhada pelo GET /api/user (cliente) e pelos
 * Server Components (ver getUserAccountData em actions.ts). Antes só existia
 * dentro da rota, então o servidor precisava fazer um fetch HTTP em si mesmo
 * pra chegar nesse dado.
 */
export async function findUserDTO(userId: string): Promise<UserDTO | null> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) return null;

  return {
    id: dbUser.id,
    username: dbUser.username,
    avatar: dbUser.avatar,
    createdAt: dbUser.createdAt.toISOString(),
    verified: dbUser.verified,
    roles: mapPrismaRoles(dbUser.roles),
    channelPreferences: (dbUser.channelPreferences as ChannelPreferences | null) ?? undefined,
    groups: dbUser.groups,
    isMobileDownloaded: dbUser.isMobileDownloaded,
  };
}
