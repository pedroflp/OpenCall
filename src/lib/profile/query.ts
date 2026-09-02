import { prisma } from '@/services/prisma';
import { channelsIdentity, PROFILE_MASK_SELECT, type ChannelsIdentity } from './identity';

/**
 * A identidade de canais de um usuário, direto do banco.
 *
 * Existe pras rotas que hoje têm em mãos só o `UserAuthDTO` da sessão — que
 * carrega o `username`/`avatar` do DISCORD, porque é o que o JWT do NextAuth
 * guarda (ver o callback `session` em authOptions.ts). A máscara não entra no
 * token de propósito: o token é cacheado por 15 minutos, e um apelido que
 * demora 15 minutos pra valer não é "na hora, em todo lugar".
 *
 * Uma query. Quem chama em caminho sensível a latência (o join da chamada)
 * dispara ela em paralelo com o que já ia esperar de qualquer jeito.
 */
export async function loadChannelsIdentity(
  userId: string,
  // A identidade do DISCORD (a da sessão), não uma `ChannelsIdentity` inteira:
  // sem máscara não existe username escondido, então `discordUsername` seria
  // sempre `null` e cada call site teria que escrever isso à mão.
  fallback: { username: string; avatar: string },
): Promise<ChannelsIdentity> {
  const mask = await prisma.user
    .findUnique({ where: { id: userId }, select: PROFILE_MASK_SELECT })
    .catch(() => null);

  // Sem o banco a pessoa entra na chamada com o nome do Discord, que é o
  // estado anterior a esta feature inteira — nunca sem nome nenhum.
  return mask ? channelsIdentity(mask) : { ...fallback, discordUsername: null };
}

/**
 * Cache em memória da mesma resposta, pra rota QUENTE.
 *
 * Hoje é uma só: o "está digitando", que dispara a cada poucos segundos por
 * pessoa enquanto ela escreve. Uma query no Postgres por tecla é o tipo de
 * carga que não aparece em teste e aparece na conta.
 *
 * O TTL é rede de segurança, não o mecanismo: quem invalida de verdade é
 * `propagateProfileChange`, no mesmo instante em que a máscara muda (por isso
 * `forgetChannelsIdentity` existe). O TTL só cobre o caso de o processo que
 * responde ao typing não ser o que gravou — que hoje nem acontece, o app roda
 * em processo único no Railway (ver o cabeçalho de lib/chat/signal.ts).
 */
const CACHE_TTL_MS = 60_000;

const globalForIdentityCache = globalThis as unknown as {
  __channelsIdentityCache?: Map<string, { identity: ChannelsIdentity; at: number }>;
};
const cache = (globalForIdentityCache.__channelsIdentityCache ??= new Map());

export async function cachedChannelsIdentity(
  userId: string,
  fallback: { username: string; avatar: string },
): Promise<ChannelsIdentity> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.identity;

  const identity = await loadChannelsIdentity(userId, fallback);
  cache.set(userId, { identity, at: Date.now() });
  return identity;
}

export function forgetChannelsIdentity(userId: string): void {
  cache.delete(userId);
}
