'use client';

import { useEffect, useState } from 'react';
import { HugeIcon } from '@/components/HugeIcon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserDTO } from '@/app/api/user/types';
import { cn } from '@/lib/utils';
import AccountLinkTab from './AccountLinkTab';
import AudioVideoTab from './AudioVideoTab';
import ProfileTab from './ProfileTab';

/**
 * Configurações do usuário.
 *
 * As abas são verticais (`orientation="vertical"`), então as setas ↑↓ navegam
 * entre elas em vez de ←→ — é o que o leitor de tela e o teclado esperam de uma
 * lista lateral.
 *
 * Cada aba recebe `active`: os conteúdos fazem polling e abrem dispositivo, e
 * nada disso deve acontecer numa aba que não está à vista. O Radix desmonta o
 * TabsContent inativo por padrão, mas `active` deixa a intenção explícita e
 * sobrevive a um `forceMount` no futuro.
 *
 * O `VoiceDeviceSettingsPopover` do rodapé da sidebar continua existindo como
 * atalho pros mesmos controles de Áudio e vídeo — aqui eles cabem sem espremer.
 */
const TABS = [
  { id: 'profile', label: 'Perfil', icon: 'user-circle' },
  { id: 'account-link', label: 'Conexão e dispositivos', icon: 'qr-code-01' },
  { id: 'audio-video', label: 'Áudio e vídeo', icon: 'mic-02' },
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
  /** Em que aba abrir — o atalho do próprio avatar no rodapé da sidebar entra direto em Perfil. */
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  // O modal fica MONTADO entre aberturas (só `open` muda), então sem isto a
  // segunda abertura cairia na última aba visitada — e um atalho que existe pra
  // levar direto a uma aba só funcionaria na primeira vez.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden p-0">
        <Tabs
          orientation="vertical"
          value={tab}
          onValueChange={(next) => setTab(next as TabId)}
          className="flex h-[min(560px,85vh)]"
        >
          {/* A lista de abas mora numa coluna própria, e não dentro do
              TabsList: um `role="tablist"` só pode conter tabs, então o título
              não pode ser irmão dos gatilhos lá dentro. */}
          <div className="flex w-52 shrink-0 flex-col gap-3 border-r bg-muted/30 p-3">
            <DialogTitle className="mb-2 px-2 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Configurações
            </DialogTitle>

            <TabsList className="h-auto flex-1 flex-col items-stretch justify-start gap-0.5 rounded-none bg-transparent p-0">
              {TABS.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className={cn(
                    'w-full justify-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium',
                    'data-[state=active]:bg-background data-[state=active]:shadow-none',
                  )}
                >
                  <HugeIcon name={item.icon} size={16} className="shrink-0" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
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
              <AccountLinkTab active={tab === 'account-link'} />
            </TabsContent>

            <TabsContent value="audio-video" className="mt-0">
              <AudioVideoTab active={tab === 'audio-video'} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
