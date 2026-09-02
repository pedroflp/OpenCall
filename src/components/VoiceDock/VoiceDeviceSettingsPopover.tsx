'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import AudioDeviceSelects from './AudioDeviceSelects';
import SoundEffectsVolume from './SoundEffectsVolume';
import VideoDeviceSelect from './VideoDeviceSelect';

export default function VoiceDeviceSettingsPopover({
  trigger,
  tooltip,
}: {
  trigger: React.ReactNode;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {tooltip ? <TooltipTrigger asChild>{trigger}</TooltipTrigger> : trigger}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={12} className="space-y-4 border-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Configurações de dispositivos</p>
        <AudioDeviceSelects active={open} />
        <Separator />
        <VideoDeviceSelect active={open} />
        <Separator />
        <SoundEffectsVolume />
        <Separator />
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 text-red-500 hover:bg-red-500/10 hover:text-red-500"
          onClick={() => signOut()}
        >
          <HugeIcon name="logout-01" size={16} />
          Sair
        </Button>
      </PopoverContent>
    </Popover>
  );

  if (!tooltip) return popover;

  return (
    <Tooltip>
      {popover}
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
