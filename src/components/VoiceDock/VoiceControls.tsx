'use client';

import { HugeIcon } from '@/components/HugeIcon';
import { useTranslations } from 'next-intl';
import { useVoice } from '@/providers/VoiceProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import ControlButton from './ControlButton';

export default function VoiceControls({ className }: { className?: string }) {
  const t = useTranslations('voice.controls');
  const { micEnabled, deafened, screenSharing, watching, toggleMic, toggleDeafen, toggleScreenShare, leaveStream, leave } = useVoice();
  const isMobile = useIsMobile();

  return (
    <div className={className}>
      <ControlButton label={micEnabled ? 'Desligar microfone' : 'Ligar microfone'} active={micEnabled} onClick={toggleMic}>
        <HugeIcon name={micEnabled ? 'mic-02' : 'mic-off-02'} size={18} />
      </ControlButton>

      <ControlButton label={deafened ? 'Voltar a ouvir' : 'Silenciar tudo'} active={!deafened} onClick={toggleDeafen}>
        <HugeIcon name={deafened ? 'headphone-mute' : 'headphones'} size={18} />
      </ControlButton>

      <ControlButton
        label={screenSharing ? t('stopStream') : t('startStream')}
        active={screenSharing}
        dangerSoft={screenSharing}
        disabled={!screenSharing && isMobile}
        onClick={toggleScreenShare}
      >
        <HugeIcon name={screenSharing ? 'monitor-stop' : 'monitor-dot'} size={18} />
      </ControlButton>

      {watching && (
        <ControlButton label={t('leaveStream')} onClick={leaveStream}>
          <HugeIcon name="monitor-stop" size={18} />
        </ControlButton>
      )}

      <div className="flex-1" />

      <ControlButton label={t('leaveChannel')} className="text-destructive" onClick={leave}>
        <HugeIcon name="call-end-01" size={18} />
      </ControlButton>
    </div>
  );
}
