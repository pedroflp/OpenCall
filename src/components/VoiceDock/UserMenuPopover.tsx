'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HugeIcon } from '@/components/HugeIcon';

/**
 * Menu da engrenagem no rodapé da sidebar — o caminho pras Configurações e pra
 * sair da conta.
 *
 * Substituiu o `VoiceDeviceSettingsPopover`, que empilhava microfone, saída,
 * câmera e volume de efeitos dentro do próprio popover. Esses controles agora
 * são a aba "Áudio e vídeo" das Configurações, e mantê-los nos dois lugares
 * seria duas superfícies pro mesmo ajuste — a que a pessoa achasse primeiro
 * decidiria qual das duas ela aprenderia a usar.
 *
 * Montado nos DOIS estados do rodapé (em voz e fora dela): o `SelfControlCard`
 * substitui o rodapé inteiro enquanto a chamada está de pé, e sem isto entrar
 * num canal fazia as Configurações sumirem.
 */
export default function UserMenuPopover({
  trigger,
  onOpenSettings,
}: {
  trigger: React.ReactNode;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={12} className="w-[220px] p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] font-semibold hover:bg-muted"
          >
            <HugeIcon name="settings-01" size={16} />
            Configurações
          </button>

          <Separator className="my-1" />

          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] font-semibold text-red-500 hover:bg-red-500/10"
          >
            <HugeIcon name="logout-01" size={16} />
            Sair
          </button>
        </PopoverContent>
      </Popover>
      <TooltipContent>Configurações</TooltipContent>
    </Tooltip>
  );
}
