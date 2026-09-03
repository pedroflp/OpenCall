'use client';

import { useEffect, useState } from 'react';
import { HugeIcon } from '@/components/HugeIcon';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { DEFAULT_SOUND_EFFECTS_VOLUME, loadChannelPreferences } from '@/lib/rtc/preferences';
import { getSoundEffectsVolume, setSoundEffectsVolume } from '@/lib/sound';

export default function SoundEffectsVolume() {
  const [volume, setVolume] = useState(DEFAULT_SOUND_EFFECTS_VOLUME);

  useEffect(() => {
    loadChannelPreferences().then(() => setVolume(getSoundEffectsVolume()));
  }, []);

  const percent = Math.round(volume * 100);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="sound-effects-volume" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <HugeIcon name={percent > 0 ? 'volume-high' : 'volume-off'} size={14} />
        {/* Efeitos sonoros */}
      </Label>
      <div className="relative">
        <Slider
          id="sound-effects-volume"
          value={[percent]}
          min={0}
          max={100}
          step={1}
          onValueChange={([next]) => {
            const nextVolume = next / 100;
            setVolume(nextVolume);
            setSoundEffectsVolume(nextVolume);
          }}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs tabular-nums">{percent}%</span>
      </div>
    </div>
  );
}
