'use client';

import { useState } from 'react';
import { HugeIcon } from '@/components/HugeIcon';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import VideoDeviceSelect from './VideoDeviceSelect';

// Colado no botão de ligar/desligar câmera (sem gap, cantos de cima
// zerados) pra ler como uma única peça — um split button clássico, com a
// seta abrindo a seleção de dispositivo pra cima.
export default function CameraDeviceButton({ active }: { active: boolean }) {
  const t = useTranslations('voice.devices');
  const [open, setOpen] = useState(false);

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('selectCamera')}
              className={cn(
                'shrink-0 rounded-tl-none rounded-bl-none border-0',
                active ? 'bg-red-950/40 text-red-500 hover:text-red-600 hover:bg-red-950/40' : 'bg-muted'
              )}
            >
              <HugeIcon name="arrow-up-01" size={16} />
            </Button>
          </TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" sideOffset={12} className="border-0">
          <VideoDeviceSelect active={open} />
        </PopoverContent>
      </Popover>
      <TooltipContent>{t('selectCamera')}</TooltipContent>
    </Tooltip>
  );
}
