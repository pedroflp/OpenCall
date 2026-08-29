'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
