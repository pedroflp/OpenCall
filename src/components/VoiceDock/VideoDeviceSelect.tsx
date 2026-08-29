'use client';

import { useEffect, useRef } from 'react';
import { HugeIcon } from '@/components/HugeIcon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoice } from '@/providers/VoiceProvider';
import { useVideoInputDevices } from '@/hooks/useVideoInputDevices';
import { videoDeviceConstraint } from '@/lib/rtc/cameraQuality';

export default function VideoDeviceSelect({ active }: { active: boolean }) {
  const { videoDeviceId, setVideoDeviceId } = useVoice();
  const devices = useVideoInputDevices(active);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Preview do dispositivo exatamente escolhido, nunca o padrão do sistema —
  // mesma lição já aplicada ao microfone (ver [[rtc-code-topology]] e
  // docs/rfc-camera.md D3). Só captura enquanto o popover está aberto.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { deviceId: videoDeviceConstraint(videoDeviceId) } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, videoDeviceId]);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <HugeIcon name="camera-01" size={14} />
        Câmera
      </Label>
      <Select value={videoDeviceId || undefined} onValueChange={setVideoDeviceId}>
        <SelectTrigger>
          <SelectValue placeholder="Padrão do sistema" />
        </SelectTrigger>
        <SelectContent>
          {devices
            .filter((device) => device.deviceId)
            .map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label || 'Câmera'}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {active && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full scale-x-[-1] rounded-md bg-black object-cover"
        />
      )}
    </div>
  );
}
