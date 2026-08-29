import { cache } from "react";
import { getUser } from "@/app/api/auth/[...nextauth]/auth";
import { findUserDTO } from "./queries";
import { UserDTO } from "./types";

/**
 * Chamado por praticamente todo layout/página do app. Consulta o banco direto:
 * antes fazia `fetchApi('user')`, um fetch HTTP do servidor pro próprio
 * /api/user — que atravessava o middleware de novo, refazia getServerSession e
 * só então rodava a mesma query. Um round trip inteiro por navegação, e sem
 * nenhum feedback na tela enquanto rolava.
 *
 * cache() do React memoiza por request: layout e página pedem o mesmo usuário
 * no mesmo render e a query roda uma vez só.
 */
export const getUserAccountData = cache(async (): Promise<UserDTO | null> => {
  const user = await getUser();
  if (!user) return null;
  return findUserDTO(user.id);
});
