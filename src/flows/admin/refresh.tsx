'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Como as views de admin pedem "recarrega os dados depois que eu mudei algo".
 *
 * Em `/admin` os dados descem de Server Component, e a resposta certa é
 * `router.refresh()`. No modal de Configurações eles vêm de fetch no client, e
 * ali o refresh do router recarregaria a árvore de servidor da página que está
 * ATRÁS do modal — nada do que está na tela, e o admin veria o switch voltar
 * sozinho ao valor antigo.
 *
 * Sem isto cada view precisaria saber onde está sendo renderizada. Com isto ela
 * só pede, e quem hospeda decide o que "recarregar" significa.
 */
const AdminRefreshContext = createContext<(() => void) | null>(null);

export function AdminRefreshProvider({ onRefresh, children }: { onRefresh: () => void; children: ReactNode }) {
  return <AdminRefreshContext.Provider value={onRefresh}>{children}</AdminRefreshContext.Provider>;
}

/** Sem provider — que é o caso da página `/admin` — cai no refresh do router de sempre. */
export function useAdminRefresh(): () => void {
  const hostRefresh = useContext(AdminRefreshContext);
  const router = useRouter();

  return useCallback(() => {
    if (hostRefresh) hostRefresh();
    else router.refresh();
  }, [hostRefresh, router]);
}
