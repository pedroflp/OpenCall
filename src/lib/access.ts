import { UserRole as PrismaUserRole } from "@prisma/client";
import { UserRoles } from "@/app/api/user/types";

export function hasCanalAccess(roles?: UserRoles[] | null): boolean {
  if (!roles) return false;
  return roles.includes(UserRoles.CANAL_ACCESS) || roles.includes(UserRoles.ADMIN);
}

/** Quem consegue acessar a aba Usuários do painel admin e mexer no toggle de CHANNELS_ACCESS — ADMIN sempre pode, mesmo sem o role explícito. */
export function hasChannelsAdminAccess(roles?: UserRoles[] | null): boolean {
  if (!roles) return false;
  return roles.includes(UserRoles.CHANNELS_ACCESS) || roles.includes(UserRoles.ADMIN);
}

// O Postgres guarda roles como enum maiúsculo (UserRole, gerado pelo Prisma);
// o resto do app (DTOs de API, client) fala UserRoles minúsculo — esse par
// de mapas é a única ponte entre os dois, pra não espalhar essa conversão.
const PRISMA_TO_APP_ROLE: Record<PrismaUserRole, UserRoles> = {
  ADMIN: UserRoles.ADMIN,
  CANAL_ACCESS: UserRoles.CANAL_ACCESS,
  CHANNELS_ACCESS: UserRoles.CHANNELS_ACCESS,
};

const APP_TO_PRISMA_ROLE: Record<UserRoles, PrismaUserRole> = {
  [UserRoles.ADMIN]: PrismaUserRole.ADMIN,
  [UserRoles.CANAL_ACCESS]: PrismaUserRole.CANAL_ACCESS,
  [UserRoles.CHANNELS_ACCESS]: PrismaUserRole.CHANNELS_ACCESS,
};

export function mapPrismaRoles(roles: PrismaUserRole[]): UserRoles[] {
  return roles.map((role) => PRISMA_TO_APP_ROLE[role]);
}

export function mapAppRole(role: UserRoles): PrismaUserRole {
  return APP_TO_PRISMA_ROLE[role];
}

/**
 * Sinal leve de "as roles desse usuário mudaram", pra furar o cache de 15min
 * do JWT (ROLES_CACHE_TTL_MS em authOptions.ts) sem reintroduzir uma query no
 * Postgres em toda checagem de sessão — só quando alguém de fato concede/revoga
 * acesso. Em memória, nó único: pior caso de um restart no meio da janela é a
 * mudança demorar até o TTL normal pra propagar, não um bug de segurança (o
 * fail-safe continua sendo o TTL).
 */
const rolesInvalidatedAt = new Map<string, number>();

export function invalidateRolesCache(userId: string): void {
  rolesInvalidatedAt.set(userId, Date.now());
}

export function rolesCacheInvalidatedAfter(userId: string, since: number): boolean {
  const invalidated = rolesInvalidatedAt.get(userId);
  return invalidated !== undefined && invalidated > since;
}
