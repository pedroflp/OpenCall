import { Suspense } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { getUser, isCurrentUserCanalAccess } from '@/app/api/auth/[...nextauth]/auth'
import { getUserAccountData } from '@/app/api/user/actions'
import VoiceChannelSidebar from '@/components/VoiceDock/VoiceChannelSidebar'
import { VoiceChannelStageSkeleton } from '@/components/VoiceDock/VoiceChannelStageSkeleton'
import DirectMessagesRail from '@/components/DirectMessagesRail'
import PlatformUsersSidebar from '@/components/PlatformUsersSidebar'
import { PlatformUsersSidebarSkeleton } from '@/components/PlatformUsersSidebar/Skeleton'
import InstallAppButton from '@/components/InstallAppButton'
import LoginPopover from '@/components/LoginPopover'
import NoAccessPopover from '@/components/NoAccessPopover'

/**
 * Layout raiz da experiência de canais — hoje é a própria home do app, sem
 * mais uma sidebar de navegação por fora (ver VoiceChannelSidebar, que já
 * cobre navegação + login no próprio rodapé). Resolve 3 estados aqui, antes
 * de decidir se `children` chega a renderizar:
 *
 * 1. Sem sessão de verdade (sem cookie, ou cookie válido mas sem linha no
 *    Postgres — ver nota em `user` abaixo): sidebar real (rodapé mostra
 *    QR/Discord), palco e lista de usuários em skeleton, com o LoginPopover
 *    por cima (não fecha: não há nada de público atrás dele).
 * 2. Sessão sem canalAccess: sidebar e lista de usuários reais, palco em
 *    skeleton, com o NoAccessPopover por cima (código de convite).
 * 3. Acesso liberado: experiência completa, `children` renderiza a página.
 */
export default async function ChannelsLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getUser();
  // `authUser` (getUser) só lê o JWT — um cookie de sessão válido sobrevive a
  // um reset de banco (dev) ou a um usuário apagado (prod) mesmo sem conta de
  // verdade. `user` (getUserAccountData) bate no Postgres e é quem decide se
  // a sessão é "real" pro resto deste layout — mesmo motivo do fix em
  // VoiceChannelSidebar (authenticated exige user !== null, não só o status
  // do NextAuth).
  const user = authUser ? await getUserAccountData() : null;
  const canalAccess = user ? await isCurrentUserCanalAccess() : false;

  return (
    <ToastProvider>
      <main className="overflow-hidden max-[899px]:flex max-[899px]:h-screen max-[899px]:w-screen max-[899px]:items-center max-[899px]:justify-center">
        <main className="flex h-screen w-full flex-row overflow-hidden max-[899px]:mt-2 max-[899px]:mb-auto max-[899px]:h-[97vh] max-[899px]:w-[98vw] max-[899px]:rounded-2xl">
          <div className="dark flex h-full w-full overflow-hidden bg-card text-foreground">
            {user && canalAccess && <DirectMessagesRail />}
            <VoiceChannelSidebar user={user} />
            <div className="relative m-auto h-[calc(100vh-1rem)] w-full flex-1 overflow-hidden rounded-2xl">
              {user && canalAccess ? children : <VoiceChannelStageSkeleton />}
            </div>
            {user && canalAccess ? <PlatformUsersSidebar /> : <PlatformUsersSidebarSkeleton />}
            {user && !user.isMobileDownloaded && <InstallAppButton />}
          </div>
        </main>
      </main>
      {!user && <LoginPopover />}
      {user && !canalAccess && (
        // useSearchParams (auto-resgate por ?invite=) exige boundary de Suspense.
        <Suspense fallback={null}>
          <NoAccessPopover />
        </Suspense>
      )}
    </ToastProvider>
  )
}
