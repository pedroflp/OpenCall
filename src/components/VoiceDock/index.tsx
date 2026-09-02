'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useParticipants } from '@livekit/components-react';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useVoice } from '@/providers/VoiceProvider';
import { useChannelPresence } from '@/hooks/useChannelPresence';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRtcEnabled } from '@/hooks/useRtcEnabled';
import { useVoiceChannels } from '@/hooks/useChannels';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import type { PresenceParticipant } from '@/lib/rtc/presence';
import LiveParticipantsList from './LiveParticipantsList';
import VoiceControls from './VoiceControls';

const MAX_STACK_AVATARS = 3;

function AvatarStack({ participants }: { participants: PresenceParticipant[] }) {
  const shown = participants.slice(0, MAX_STACK_AVATARS);
  const overflow = participants.length - shown.length;

  return (
    <div className="flex -space-x-2">
      {shown.map((participant) => (
        <Avatar
          key={participant.identity}
          image={participant.avatar}
          fallback={participant.name.slice(0, 2)}
          size={8}
          className="ring-2 ring-card"
        />
      ))}
      {overflow > 0 && (
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold ring-2 ring-card">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function CardHeaderInfo({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="size-2 shrink-0 rounded-full bg-green-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'pessoa' : 'pessoas'}
        </p>
      </div>
    </div>
  );
}

/** Já conectado: painel completo, com controles. Clicar fora dos botões abre a visualização da sala. */
function ConnectedCard({ onNavigate }: { onNavigate: () => void }) {
  const { channel } = useVoice();
  const participants = useParticipants();

  return (
    <Card className="w-72 cursor-pointer overflow-hidden shadow-lg" onClick={onNavigate}>
      <CardHeaderInfo name={channel?.name ?? ''} count={participants.length} />
      <Separator />
      <ScrollArea className="max-h-56">
        <LiveParticipantsList className="p-1" />
      </ScrollArea>
      <Separator />
      <VoiceControls className="flex items-center gap-1.5 p-2" />
    </Card>
  );
}

/** Alguém está no canal padrão, mas eu não. Card leve, sem controles. */
function PreviewCard({
  channelName,
  participants,
  onNavigate,
  onJoin,
}: {
  channelName: string;
  participants: PresenceParticipant[];
  onNavigate: () => void;
  onJoin: () => void;
}) {
  return (
    <Card className="w-64 cursor-pointer overflow-hidden shadow-lg" onClick={onNavigate}>
      <div className="flex items-center gap-3 p-3">
        <AvatarStack participants={participants} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{channelName}</p>
          <p className="text-xs text-muted-foreground">
            {participants.length} {participants.length === 1 ? 'pessoa na sala' : 'pessoas na sala'}
          </p>
        </div>
      </div>
      <Separator />
      <div className="p-2">
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={(event) => {
            event.stopPropagation();
            onJoin();
          }}
        >
          <HugeIcon name="login-01" size={18} className="mr-2" />
          Entrar
        </Button>
      </div>
    </Card>
  );
}

const VOICE_ANNOUNCEMENT_DISMISS_KEY = 'voice-announcement-dismissed';

/** Ninguém no canal padrão ainda. Anúncio da feature. */
function AnnouncementCard({ onNavigate }: { onNavigate: () => void }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(VOICE_ANNOUNCEMENT_DISMISS_KEY) === '1');
  }, []);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(VOICE_ANNOUNCEMENT_DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <Card className="relative mr-8 mb-8 w-[380px]  from-primary/0 to-primary/10 bg-gradient-to-bl overflow-hidden rounded-3xl border-border/60 p-5 shadow-xl shadow-yellow-500/10">
      <div className="absolute inset-0 overflow-hidden blur-[1px] [mask-image:linear-gradient(to_left,black_0%,black_0%,transparent_62%)] [-webkit-mask-image:linear-gradient(to_left,black_0%,black_12%,transparent_62%)]">
        <div className="absolute -right-4 top-3.5 w-[200px] rounded-xl border border-foreground/14 p-2">
          <div className="mb-[7px] flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-foreground/16" />
            <span className="size-1.5 rounded-full bg-foreground/16" />
            <span className="size-1.5 rounded-full bg-foreground/16" />
            <span className="ml-1.5 h-1.5 flex-1 rounded-full bg-foreground/8" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-primary/50 bg-primary/6">
              <span className="size-5 rounded-full border border-foreground/25" />
            </div>
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex aspect-[4/3] items-center justify-center rounded-lg border border-foreground/14 bg-foreground/3">
                <span className="size-5 rounded-full border border-foreground/20" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-foreground/12 p-[5px]">
            <span className="size-3.5 rounded-full border border-foreground/30" />
            <span className="size-3.5 rounded-full border border-foreground/30" />
            <span className="size-3.5 rounded-full bg-destructive/60" />
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={dismiss}
        className="absolute right-3 top-3 z-[2] flex size-[26px] items-center justify-center rounded-full bg-black/35 text-white/85 transition-colors hover:bg-black/55"
      >
        <HugeIcon name="cancel-01" size={13} />
      </button>

      <div className="relative z-[1] flex flex-col gap-2.5">
        <div className="flex w-fit items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-2 pr-2.5">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-semibold text-foreground/85">Novidade</span>
        </div>
        <h3 className="max-w-[20ch] text-[19px] font-bold leading-tight">Chegou o OpenCall</h3>
        <p className="max-w-[24ch] text-[13px] leading-normal text-muted-foreground">
          Entre em um canal e compartilhe sua tela com a tropa, direto pelo app.
        </p>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onNavigate();
          }}
          className="mt-0.5 flex w-fit items-center gap-[5px] text-[13px] font-semibold text-primary underline underline-offset-[3px]"
        >
          Experimentar agora
          <HugeIcon name="arrow-right-01" size={14} />
        </a>
      </div>
    </Card>
  );
}

export default function VoiceDock({ className }: { className?: string }) {
  const { status, channel, join } = useVoice();
  const { data: session, status: sessionStatus } = useSession();
  const router = useTransitionRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  // A experiência de canais é a própria home agora — só /admin fica de fora
  // dela, então "está numa página de canal" virou "não está em /admin".
  const onChannelPage = !pathname?.startsWith('/admin');
  const hasCanalAccess = sessionStatus === 'authenticated' && Boolean(session?.user?.canalAccess);
  const { rtcEnabled } = useRtcEnabled(hasCanalAccess);
  const hasAccess = hasCanalAccess && rtcEnabled;
  const { channels: voiceChannels } = useVoiceChannels();
  const defaultChannel = voiceChannels[0] ?? null;
  const preview = useChannelPresence(
    defaultChannel?.id ?? '',
    hasAccess && Boolean(defaultChannel) && status !== 'connected' && !onChannelPage,
  );

  // No mobile não tem espaço pra esse card flutuante sem sobrepor a UI —
  // quem quiser voltar ao canal usa a navegação normal do app.
  if (!hasAccess || onChannelPage || isMobile || !defaultChannel) return null;

  const goToChannel = () => router.push(routeNames.CHANNEL(channel?.id ?? defaultChannel.id));

  const showConnected = status === 'connected' && Boolean(channel);
  const showPreview = !showConnected && preview.participants.length > 0;
  const showAnnouncement = !showConnected && !showPreview && !preview.loading;

  if (!showConnected && !showPreview && !showAnnouncement) return null;

  return (
    <div className={cn('fixed bottom-4 left-4 z-50', className)}>
      {showConnected ? (
        <ConnectedCard onNavigate={goToChannel} />
      ) : showPreview ? (
        <PreviewCard
          channelName={defaultChannel.name}
          participants={preview.participants}
          onNavigate={goToChannel}
          onJoin={() => {
            goToChannel();
            join(defaultChannel.id);
          }}
        />
      ) : (
        <AnnouncementCard onNavigate={goToChannel} />
      )}
    </div>
  );
}
