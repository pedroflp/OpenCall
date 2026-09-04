'use client';

import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoice } from '@/providers/VoiceProvider';

function useOutputDeviceSupport(): boolean {
  const [supported] = useState(
    () => typeof window !== 'undefined' && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
  );
  return supported;
}

export default function AudioDeviceSelects({ active }: { active: boolean }) {
  const t = useTranslations('voice.devices');
  const { inputDeviceId, outputDeviceId, setInputDeviceId, setOutputDeviceId } = useVoice();
  const outputSupported = useOutputDeviceSupport();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = (requestPermissions: boolean) => {
      Room.getLocalDevices('audioinput', requestPermissions)
        .then((devices) => {
          if (!cancelled) setInputs(devices);
        })
        .catch(() => {
          if (!cancelled) setInputs([]);
        });

      if (outputSupported) {
        Room.getLocalDevices('audiooutput')
          .then((devices) => {
            if (!cancelled) setOutputs(devices);
          })
          .catch(() => {
            if (!cancelled) setOutputs([]);
          });
      }
    };

    load(true);
    const handleDeviceChange = () => load(false);
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [active, outputSupported]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <HugeIcon name="mic-02" size={14} />
          {t('microphone')}
        </Label>
        <Select value={inputDeviceId || undefined} onValueChange={setInputDeviceId}>
          <SelectTrigger>
            <SelectValue placeholder={t('systemDefault')} />
          </SelectTrigger>
          <SelectContent>
            {inputs
              .filter((device) => device.deviceId)
              .map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || t('microphone')}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {outputSupported ? (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <HugeIcon name="headphones" size={14} />
            {t('audioOutput')}
          </Label>
          <Select value={outputDeviceId || undefined} onValueChange={setOutputDeviceId}>
            <SelectTrigger>
              <SelectValue placeholder={t('systemDefault')} />
            </SelectTrigger>
            <SelectContent>
              {outputs
                .filter((device) => device.deviceId)
                .map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || 'Alto-falante'}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('outputUnsupported')}
        </p>
      )}
    </div>
  );
}
