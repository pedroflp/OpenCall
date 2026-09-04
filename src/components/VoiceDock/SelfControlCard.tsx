'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UserDTO } from '@/app/api/user/types';
import { useSelfIdentity } from '@/hooks/useSelfIdentity';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoice } from '@/providers/VoiceProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useVideoInputDevices } from '@/hooks/useVideoInputDevices';
import { cn } from '@/lib/utils';
import CameraDeviceButton from './CameraDeviceButton';
import ConnectionQualityIndicator from './ConnectionQualityIndicator';
import MicSettingsPopover from './MicSettingsPopover';
import SettingsDialog from '@/components/SettingsDialog';

function SelfButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? 'destructive' : 'ghost'}
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function SelfControlCard({ channelName, user }: { channelName: string; user: UserDTO | null }) {
  const t = useTranslations('voice.controls');
  const tSidebar = useTranslations('voice.sidebar');
  const tDevices = useTranslations('voice.devices');
  const tCommon = useTranslations('common');
  const {
    channel,
    micEnabled,
    deafened,
    serverMuted,
    screenSharing,
    cameraEnabled,
    videoFacingMode,
    watching,
    toggleMic,
    toggleDeafen,
    toggleScreenShare,
    toggleCamera,
    flipCamera,
    leaveStream,
    leave,
  } = useVoice();
  const isMobile = useIsMobile();
  const cameraDevices = useVideoInputDevices(true);
  const canFlipCamera = cameraEnabled && videoFacingMode !== null && cameraDevices.length > 1;
  const canSelectCameraDevice = cameraDevices.length > 1;

  // Máscara de perfil resolvida aqui, e não no `user` cru: o UserDTO é prop de
  // Server Component e só renova no router.refresh() — o evento `profile` chega
  // antes (ver useSelfIdentity).
  const identity = useSelfIdentity(user);
  // Mesmas entradas do rodapé desconectado: quem entra num canal não pode
  // perder o caminho pras Configurações (era o que acontecia — este cartão
  // substitui o rodapé inteiro enquanto a chamada está de pé).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'audio-video'>('profile');

  function openSettings(tab: 'profile' | 'audio-video') {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }
  const name = identity?.username || tCommon('you');

  return (
    <div className="max-[899px]:m-2 p-2 relative py-4 rounded-2xl overflow-hidden bg-gradient-to-tr to-emerald-600/10 from-accent/10">
      <Avatar image={identity?.avatar} className='absolute bottom-0 left-0 blur-lg opacity-80 pointer-events-none z-1' fallback={name.slice(0, 2)} size={24} />
      <div className="relative z-2 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 ml-1">
          <ConnectionQualityIndicator>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-green-500">{tSidebar('voiceConnected')}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{channel?.name ?? channelName}</div>
            </div>
          </ConnectionQualityIndicator>
          <div className='flex items-center gap-1'>
            <MicSettingsPopover
              trigger={
                <Button type="button" size="icon" variant="ghost" aria-label={tDevices('micSettings')}>
                  <HugeIcon name="audio-wave-02" size={19} />
                </Button>
              }
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t('leaveChannel')}
                  onClick={() => leave()}
                  className="shrink-0 text-red-500 hover:text-red-600"
                >
                  <HugeIcon name="call-end-01" size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('leaveChannel')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!screenSharing && (
            <div className={cn("flex items-center gap-1", (cameraEnabled || watching) ? "w-full" : "w-[50%]")}>
              {canFlipCamera && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('flipCamera')}
                      className="shrink-0 border-0 bg-muted"
                      onClick={() => flipCamera()}
                    >
                      <HugeIcon name="switch-camera" size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('flipCamera')}</TooltipContent>
                </Tooltip>
              )}
              <div className="flex flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={cameraEnabled ? t('cameraOff') : t('cameraOn')}
                      aria-pressed={cameraEnabled}
                      className={cn(
                        'flex-1 gap-2 border-0',
                        canSelectCameraDevice && 'rounded-tr-none rounded-br-none',
                        cameraEnabled
                          ? 'bg-red-950/40 text-red-500 hover:text-red-600 hover:bg-red-950/40'
                          : 'bg-muted'
                      )}
                      onClick={() => toggleCamera()}
                    >
                      <HugeIcon className='-mr-4' name={cameraEnabled ? 'camera-off-01' : 'camera-01'} size={20} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{cameraEnabled ? t('cameraOff') : t('cameraOn')}</TooltipContent>
                </Tooltip>
                {canSelectCameraDevice && <CameraDeviceButton active={cameraEnabled} />}
              </div>
            </div>
          )}

          {screenSharing ? (
            <Button
              type="button"
              size="sm"
              className="flex-1 w-full gap-2 bg-red-950/40 text-red-500 hover:text-red-600 hover:bg-red-950/40"
              onClick={() => toggleScreenShare()}
            >
              <HugeIcon name="monitor-stop" size={20} />
              {t('endStream')}
            </Button>
          ) : (
            !cameraEnabled && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full gap-2 py-5"
                disabled={isMobile}
                onClick={() => toggleScreenShare()}
              >
                <HugeIcon name="computer" size={20} />
                {!watching && t('startStream')}
              </Button>
            )
          )}

          {!screenSharing && watching && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  aria-label={t('leaveStream')}
                  onClick={() => leaveStream()}
                  className="w-full bg-red-950/40 text-red-700 hover:bg-red-950/40 hover:text-red-600"
                >
                  <HugeIcon name="view-off-slash" size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('leaveStream')}</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={tSidebar('editProfile')}
                onClick={() => openSettings('profile')}
                className="relative shrink-0 rounded-full transition-opacity hover:opacity-80"
              >
                <Avatar image={identity?.avatar} fallback={name.slice(0, 2)} size={10} />
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-background" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tSidebar('editProfile')}</TooltipContent>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold text-green-500">{name}</div>
            <div className="text-[11.5px] text-muted-foreground">{tSidebar('inVoice')}</div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <SelfButton
              label={serverMuted ? t('micMutedByAdmin') : micEnabled ? t('micOff') : t('micOn')}
              active={!micEnabled}
              onClick={() => toggleMic()}
            >
              <HugeIcon name={micEnabled ? 'mic-02' : 'mic-off-02'} size={19} />
            </SelfButton>
            <SelfButton label={deafened ? t('deafenOff') : t('deafenOn')} active={deafened} onClick={() => toggleDeafen()}>
              <HugeIcon name={deafened ? 'headphone-mute' : 'headphones'} size={19} />
            </SelfButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label={t('settings')}
                  onClick={() => openSettings('audio-video')}
                >
                  <HugeIcon name="settings-01" size={19} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user} initialTab={settingsTab} />
    </div>
  );
}
