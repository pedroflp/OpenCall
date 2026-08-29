'use client';

import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';

/** Mesmo padrão de enumeração usado em AudioDeviceSelects/VideoDeviceSelect. */
export function useVideoInputDevices(active: boolean): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = (requestPermissions: boolean) => {
      Room.getLocalDevices('videoinput', requestPermissions)
        .then((found) => {
          if (!cancelled) setDevices(found);
        })
        .catch(() => {
          if (!cancelled) setDevices([]);
        });
    };

    load(true);
    const handleDeviceChange = () => load(false);
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [active]);

  return devices;
}
