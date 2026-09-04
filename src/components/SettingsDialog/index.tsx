'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserDTO } from '@/app/api/user/types';
import { cn } from '@/lib/utils';
import AccountLinkTab from './AccountLinkTab';
import AdminTab from './AdminTab';
import AudioVideoTab from './AudioVideoTab';
import LanguageTab from './LanguageTab';
import ProfileTab from './ProfileTab';

/**
 * Configurações do usuário. Alcançável dos dois estados do rodapé da sidebar
 * (em voz e fora dela), pelo avatar (aba Perfil) e pela engrenagem (aba Áudio e
 * vídeo).
 *
 * As abas são verticais (`orientation="vertical"`), então as setas ↑↓ navegam
 * entre elas em vez de ←→ — é o que o leitor de tela e o teclado esperam de uma
 * lista lateral.
 *
 * Cada aba recebe `active`: os conteúdos fazem polling, abrem dispositivo e
 * buscam dados de admin, e nada disso deve acontecer numa aba que não está à
 * vista. O Radix desmonta o TabsContent inativo por padrão, mas `active` deixa
 * a intenção explícita e sobrevive a um `forceMount` no futuro.
 */

/**
 * `section: null` é o grupo do RODAPÉ, e ele não ganha rótulo de propósito:
 * Admin é administração do servidor e Sair não é nem aba — o que as duas têm em
 * comum é justamente não pertencerem ao grupo de cima. Um título ali daria nome
 * a uma sobra.
 */
/**
 * `label` é a CHAVE dentro de `settings.tabs`, não o texto: a lista é montada
 * fora do componente (é constante), e `useTranslations` só existe durante o
 * render — quem traduz é o `renderTrigger` lá embaixo.
 */
const TABS = [
  { id: 'profile', label: 'profile', icon: 'user-circle', adminOnly: false, section: 'account' },
  { id: 'account-link', label: 'accountLink', icon: 'qr-code-01', adminOnly: false, section: 'account' },
  { id: 'audio-video', label: 'audioVideo', icon: 'mic-02', adminOnly: false, section: 'account' },
  { id: 'language', label: 'language', icon: 'translate', adminOnly: false, section: 'account' },
  { id: 'admin', label: 'admin', icon: 'shield-01', adminOnly: true, section: null },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsDialog({
  open,
  onOpenChange,
  user,
  initialTab = 'profile',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dono da máscara de perfil (aba Perfil). Vem do mesmo UserDTO que o rodapé da sidebar já tem em mãos. */
  user?: UserDTO | null;
  /** Em que aba abrir — o avatar do rodapé entra direto em Perfil, a engrenagem em Áudio e vídeo. */
  initialTab?: TabId;
}) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [tab, setTab] = useState<TabId>(initialTab);
  const { data: session } = useSession();

  // O modal fica MONTADO entre aberturas (só `open` muda), então sem isto a
  // segunda abertura cairia na última aba visitada — e um atalho que existe pra
  // levar direto a uma aba só funcionaria na primeira vez.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // Mesmo piso da rota /admin (isCurrentUserChannelsAdmin já cobre ADMIN): quem
  // entra decide o que vê lá dentro. Isto aqui é só o que aparece na lista — a
  // autorização de verdade está em cada rota de API, porque esconder um botão
  // não protege nada.
  const canSeeAdmin = Boolean(session?.user?.isAdmin || session?.user?.isChannelsAdmin);
  const tabs = TABS.filter((item) => !item.adminOnly || canSeeAdmin);

  // A aba selecionada pode sair da lista debaixo do pé (papel revogado, sessão
  // que expirou com o modal aberto). Sem isto o Radix ficaria com um `value`
  // sem gatilho nem painel, e a coluna de conteúdo apareceria vazia.
  const activeTab: TabId = tabs.some((item) => item.id === tab) ? tab : TABS[0].id;

  const mainTabs = tabs.filter((item) => item.section === 'account');
  const footerTabs = tabs.filter((item) => !item.section);

  const renderTrigger = (item: (typeof TABS)[number], extraClassName?: string) => (
    <TabsTrigger
      key={item.id}
      value={item.id}
      className={cn(
        'w-full justify-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium',
        'data-[state=active]:bg-card data-[state=active]:shadow-none',
        extraClassName,
      )}
    >
      <HugeIcon name={item.icon} size={16} className="shrink-0" />
      {t(`tabs.${item.label}`)}
    </TabsTrigger>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Largura e altura maiores porque a aba Administração traz o
          AdminTabsView inteiro (barra de abas própria + tabela de usuários) —
          no tamanho anterior a tabela perdia coluna e a aba abria já rolando. */}
      <DialogContent className="w-[calc(100%-2rem)] max-w-6xl overflow-hidden p-0">
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(next) => setTab(next as TabId)}
          className="flex h-[min(760px,88vh)]"
        >
          {/* A lista de abas mora numa coluna própria, e não dentro do
              TabsList: um `role="tablist"` só pode conter tabs, então o título
              não pode ser irmão dos gatilhos lá dentro. */}
          <div className="flex w-56 shrink-0 flex-col gap-3 border-r bg-muted p-3">
            <DialogTitle className="mb-2 px-2 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t('title')}
            </DialogTitle>

            <TabsList className="h-auto flex-1 flex-col items-stretch justify-start gap-0.5 rounded-none bg-transparent p-0">
              {mainTabs.map((item) => renderTrigger(item))}

              {/* Empurrado pro fundo pelo `mt-auto` da PRIMEIRA aba de rodapé
                  que sobreviveu ao filtro, e não numa aba fixa: Administração
                  some pra quem não é admin, e amarrar o empurrão a ela deixaria
                  o botão de sair subir e colar no grupo de cima. */}
              {footerTabs.map((item, index) => renderTrigger(item, index === 0 ? 'mt-auto' : undefined))}
            </TabsList>

            {/* Sair mora aqui, e não num menu por fora: é ação de CONTA, e o
                lugar de tudo que é da conta passou a ser este modal. Fica fora
                do TabsList porque não é aba — um `role="tablist"` só pode conter
                tabs, e um botão que não abre painel nenhum quebraria a
                navegação por setas. */}
            <button
              type="button"
              onClick={() => signOut()}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-red-500',
                'hover:bg-red-500/10',
                footerTabs.length === 0 && 'mt-auto',
              )}
            >
              <HugeIcon name="logout-01" size={16} className="shrink-0" />
              {tCommon('signOut')}
            </button>
          </div>

          {/*
            Nada de `flex`/`grid` no TabsContent. O Radix esconde o painel
            inativo com o atributo `hidden`, que vale por `[hidden]{display:none}`
            da folha do navegador — e QUALQUER utilitário de display do Tailwind
            ganha dessa regra por especificidade. Com `flex` aqui, o painel
            escondido continuaria ocupando altura e empurraria o ativo pra fora
            da vista. Layout interno é problema do componente da aba.
          */}
          <div className="min-w-0 flex-1 overflow-y-auto bg-card p-5">
            <TabsContent value="profile" className="mt-0">
              <ProfileTab user={user ?? null} />
            </TabsContent>

            <TabsContent value="account-link" className="mt-0">
              <AccountLinkTab active={activeTab === 'account-link'} />
            </TabsContent>

            <TabsContent value="audio-video" className="mt-0">
              <AudioVideoTab active={activeTab === 'audio-video'} />
            </TabsContent>

            <TabsContent value="language" className="mt-0">
              <LanguageTab />
            </TabsContent>

            {/* `-m-5` cancela o padding desta coluna só aqui: o AdminTabsView
                veio de uma página e traz o container e o respiro dele. Sem isso
                é padding sobre padding, e a tabela de usuários perde largura à
                toa.

                Sozinho, sem o `mt-0` dos vizinhos: o `cn` do primitivo é
                tailwind-merge, então a margem negativa já derruba o `mt-2`
                padrão do TabsContent — e um `mt-0` depois dela devolveria
                justamente a borda de cima que se está cancelando. */}
            {canSeeAdmin && (
              <TabsContent value="admin" className="-m-5">
                <AdminTab active={activeTab === 'admin'} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
