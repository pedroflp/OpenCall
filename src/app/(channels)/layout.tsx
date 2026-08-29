import { ToastProvider } from '@/components/ui/toast'
import { getUser, isCurrentUserCanalAccess } from '@/app/api/auth/[...nextauth]/auth'
import { getUserAccountData } from '@/app/api/user/actions'
import VoiceChannelSidebar from '@/components/VoiceDock/VoiceChannelSidebar'
import { VoiceChannelStageSkeleton } from '@/components/VoiceDock/VoiceChannelStageSkeleton'
import PlatformUsersSidebar from '@/components/PlatformUsersSidebar'
import { PlatformUsersSidebarSkeleton } from '@/components/PlatformUsersSidebar/Skeleton'
import InstallAppButton from '@/components/InstallAppButton'
import { HugeIcon } from '@/components/HugeIcon'

/** Autenticado, mas sem a role canalAccess liberada — mesmo texto que a antiga home mostrava, só que agora dentro do palco central em vez de uma página própria. */
function NoCanalAccessMessage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <HugeIcon name="lock-01" size={48} className="text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">
        Sua conta ainda não tem acesso aos canais. Peça pra um admin liberar em /admin/channels.
      </p>
    </div>
  );
}

/**
 * Layout raiz da experiência de canais — hoje é a própria home do app, sem
 * mais uma sidebar de navegação por fora (ver VoiceChannelSidebar, que já
 * cobre navegação + login no próprio rodapé). Resolve 3 estados aqui, antes
 * de decidir se `children` chega a renderizar:
 *
 * 1. Sem sessão: sidebar real (rodapé mostra QR/Discord), palco e lista de
 *    usuários em skeleton — não há canal real pra buscar ainda.
 * 2. Sessão sem canalAccess: sidebar e lista de usuários reais, palco com o
 *    aviso de acesso pendente.
 * 3. Acesso liberado: experiência completa, `children` renderiza a página.
 */
export default async function ChannelsLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getUser();
  const canalAccess = authUser ? await isCurrentUserCanalAccess() : false;
  const user = authUser ? await getUserAccountData() : null;

  return (
    <ToastProvider>
      <main className="overflow-hidden max-[899px]:flex max-[899px]:h-screen max-[899px]:w-screen max-[899px]:items-center max-[899px]:justify-center">
        <main className="flex h-screen w-full flex-row overflow-hidden max-[899px]:mt-2 max-[899px]:mb-auto max-[899px]:h-[97vh] max-[899px]:w-[98vw] max-[899px]:rounded-2xl">
          <div className="dark flex h-full w-full overflow-hidden bg-card text-foreground">
            <VoiceChannelSidebar user={user} />
            <div className="relative m-auto h-[calc(100vh-1rem)] w-full flex-1 overflow-hidden rounded-2xl">
              {!authUser ? <VoiceChannelStageSkeleton /> : canalAccess ? children : <NoCanalAccessMessage />}
            </div>
            {authUser && canalAccess ? <PlatformUsersSidebar /> : <PlatformUsersSidebarSkeleton />}
            {user && !user.isMobileDownloaded && <InstallAppButton />}
          </div>
        </main>
      </main>
    </ToastProvider>
  )
}
