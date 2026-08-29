'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Link } from 'next-view-transitions';
import { useSession } from 'next-auth/react';
import { useParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import type { UserDTO } from '@/app/api/user/types';
import type { PresenceParticipant } from '@/lib/rtc/presence';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoice } from '@/providers/VoiceProvider';
import { useChannelPresence } from '@/hooks/useChannelPresence';
import { useChatUnread } from '@/hooks/useChatUnread';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRtcEnabled } from '@/hooks/useRtcEnabled';
import { CHANNEL_LIST, DEFAULT_CHANNEL_ID, type Channel } from '@/lib/rtc/channels';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';
import DiscordOAuth from '@/components/DiscordOAuth';
import QrLoginButton from '@/components/QrLoginButton';
import InviteToChannelsModal from './InviteToChannelsModal';
import LoginQrModal from './LoginQrModal';
import ParticipantTile from './ParticipantTile';
import PreviewParticipantsList from './PreviewParticipantsList';
import SelfControlCard from './SelfControlCard';
import VoiceDeviceSettingsPopover from './VoiceDeviceSettingsPopover';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Header rico de um canal de voz: usado tanto pra quem está conectado nele quanto pra quem está só olhando a página dele (clique entra). */
function ChannelHeader({
  channelName,
  onNameClick,
  href,
  tooltip = 'Entrar no canal',
  connected,
}: {
  channelName: string;
  onNameClick?: () => void;
  href?: string;
  tooltip?: string;
  connected: boolean;
}) {
  const { screenSharing, screenShareCountdown } = useVoice();

  const disconnectCountdown =
    screenSharing && screenShareCountdown !== null
      ? { seconds: screenShareCountdown, tooltip: 'Tempo para a transmissão ser fechada se ninguém entrar' }
      : null;

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <HugeIcon name="volume-high" size={19} className="shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 truncate text-[15px] font-semibold', !connected && 'text-muted-foreground')}>{channelName}</span>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {disconnectCountdown && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex w-fit items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-destructive">
                <HugeIcon name="timer-01" size={12} />
                {formatDuration(disconnectCountdown.seconds)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{disconnectCountdown.tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40',
              connected && 'bg-muted/40 hover:bg-muted/60'
            )}
          >
            {content}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  if (onNameClick) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onNameClick}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40',
              connected && 'bg-muted/40 hover:bg-muted/60'
            )}
          >
            {content}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg px-2 py-1.5', connected && 'bg-muted/40')}>
      {content}
    </div>
  );
}

const MAX_STACK_AVATARS = 3;

/** Stack compacto dos avatares de quem está no canal, pra caber numa linha da sidebar. */
function ChannelParticipantsStack({ participants }: { participants: PresenceParticipant[] }) {
  const shown = participants.slice(0, MAX_STACK_AVATARS);
  const overflow = participants.length - shown.length;

  return (
    <div className="flex shrink-0 -space-x-2">
      {shown.map((participant) => (
        <Avatar
          key={participant.identity}
          image={participant.avatar}
          fallback={participant.name.slice(0, 2)}
          size={6}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 && (
        <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-2 ring-background">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Canal de voz sem nenhuma relação com a página atual: navega e entra na sala junto (um clique faz as duas coisas). */
function ChannelListItem({ channel, rtcEnabled }: { channel: Channel; rtcEnabled: boolean }) {
  const presence = useChannelPresence(channel.id, rtcEnabled);
  const { join } = useVoice();
  const streamer = presence.participants.find((participant) => participant.isStreaming);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={routeNames.CHANNEL(channel.id)}
          onClick={() => void join(channel.id)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <HugeIcon name="volume-high" size={19} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{channel.name}</span>
          {streamer && (
            // Clique aqui borbulha pro Link (navega + join(channel.id) normal), mas
            // dispara primeiro — join(channel.id, streamer.identity) já marca
            // `joining.current`, então o join redundante do Link vira no-op e quem
            // entrar já cai direto assistindo a live, sem precisar de um segundo clique.
            <Badge
              role="button"
              tabIndex={0}
              variant="destructive"
              className="shrink-0 cursor-pointer text-md"
              onClick={() => void join(channel.id, streamer.identity)}
            >
              AO VIVO
            </Badge>
          )}
          {presence.participants.length > 0 && <ChannelParticipantsStack participants={presence.participants} />}
        </Link>
      </TooltipTrigger>
      <TooltipContent>Entrar no canal</TooltipContent>
    </Tooltip>
  );
}

/** Canal em que estamos de fato conectados agora (independente da página que está sendo vista): header rico + participantes ao vivo. */
function ConnectedChannelRow({ channel }: { channel: Channel }) {
  const pathname = usePathname();
  // Fora da página do canal (ex.: vendo o chat) — clicar no header volta pra
  // tela de voz sem reconectar (join() já é no-op quando já conectado nele).
  const onOwnPage = pathname === routeNames.CHANNEL(channel.id);
  const participants = useParticipants();
  // Reativo a publish/unpublish de tela — dá a lista de quem está transmitindo
  // agora sem precisar reimplementar a escuta de eventos do room feita em
  // useParticipantMedia.
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  const sortedParticipants = useMemo(() => {
    const liveIdentities = new Set(
      screenShareTracks.filter((track) => !track.publication.isMuted).map((track) => track.participant.identity)
    );
    // Sort estável: quem está "ao vivo" (compartilhando tela) sempre aparece
    // primeiro, sem embaralhar a ordem de quem não está.
    return [...participants].sort(
      (a, b) => Number(liveIdentities.has(b.identity)) - Number(liveIdentities.has(a.identity))
    );
  }, [participants, screenShareTracks]);

  return (
    <div className="flex flex-col gap-0.5">
      <ChannelHeader
        channelName={channel.name}
        href={onOwnPage ? undefined : routeNames.CHANNEL(channel.id)}
        tooltip="Voltar para o canal"
        connected
      />
      <ul className="mt-1 flex flex-col gap-0.5 pl-3.5">
        {sortedParticipants.map((participant) => (
          <ParticipantTile key={participant.identity} participant={participant} />
        ))}
      </ul>
    </div>
  );
}

/** Canal cuja página está sendo vista agora, mas sem estar conectado nele: header rico como botão de entrar + preview de quem já está lá. */
function PreviewActiveChannelRow({
  channel,
  rtcEnabled,
  joining,
  onJoin,
  user,
  isChannelsAdmin,
  isFullAdmin,
}: {
  channel: Channel;
  rtcEnabled: boolean;
  joining: boolean;
  onJoin: () => void;
  user: UserDTO | null;
  isChannelsAdmin: boolean;
  isFullAdmin: boolean;
}) {
  const presence = useChannelPresence(channel.id, rtcEnabled);

  return (
    <div className="flex flex-col gap-0.5">
      <ChannelHeader channelName={channel.name} onNameClick={joining ? undefined : onJoin} connected={false} />
      <PreviewParticipantsList
        channelId={channel.id}
        participants={presence.participants}
        joining={joining}
        user={user}
        isChannelsAdmin={isChannelsAdmin}
        isFullAdmin={isFullAdmin}
        className="mt-1 flex flex-col gap-0.5 pl-3.5"
      />
    </div>
  );
}

function VoiceChannelsSection({
  rtcEnabled,
  user,
  isChannelsAdmin,
  isFullAdmin,
}: {
  rtcEnabled: boolean;
  user: UserDTO | null;
  isChannelsAdmin: boolean;
  isFullAdmin: boolean;
}) {
  const pathname = usePathname();
  const { status, channel: voiceChannel, join } = useVoice();
  const connectedChannelId = status === 'connected' ? (voiceChannel?.id ?? null) : null;
  const joining = status === 'connecting';

  const activePageChannel = CHANNEL_LIST.find((c) => pathname === routeNames.CHANNEL(c.id));
  const activePageChannelId = activePageChannel ? activePageChannel.id : pathname === routeNames.CHANNELS ? DEFAULT_CHANNEL_ID : null;

  return (
    <div className="flex flex-col gap-0.5">
      {CHANNEL_LIST.map((channel) => {
        if (channel.id === connectedChannelId) return <ConnectedChannelRow key={channel.id} channel={channel} />;

        if (channel.id === activePageChannelId) {
          return (
            <PreviewActiveChannelRow
              key={channel.id}
              channel={channel}
              rtcEnabled={rtcEnabled}
              joining={joining}
              onJoin={() => join(channel.id)}
              user={user}
              isChannelsAdmin={isChannelsAdmin}
              isFullAdmin={isFullAdmin}
            />
          );
        }

        return <ChannelListItem key={channel.id} channel={channel} rtcEnabled={rtcEnabled} />;
      })}
    </div>
  );
}

function RtcHeader({
  isAdmin,
  rtcEnabled,
  onToggleRtc,
  user,
}: {
  isAdmin: boolean;
  rtcEnabled: boolean;
  onToggleRtc: (enabled: boolean) => void;
  user: UserDTO | null;
}) {
  const isMobile = useIsMobile();

  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <div className="flex items-center gap-1">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="p-1 px-2 -mx-2 text-md"
            >
              {/* <Image src="/assets/icons/opencall.png" width={40} height={40} alt="OpenCall" className="size-6 rounded-md" /> */}
              OpenCall
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 border-0 p-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setInviteOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <HugeIcon name="user-add-02" size={16} />
              Convidar para canais
            </button>
          </PopoverContent>
        </Popover>
      </div>
      {!isMobile && <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className='gap-1 text-[10px] px-1.5 h-6 -mr-2 max-[899px]:-mr-4'
            onClick={() => setQrOpen(true)}
            aria-label="Entrar via QR code"
          >
            <HugeIcon name="qr-code-01" size={16} />
            Entrar com QR Code
          </Button>
        </TooltipTrigger>
        <TooltipContent>Entre no celular e faça login com o QR Code</TooltipContent>
      </Tooltip>}

      {/* {isAdmin && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <Switch
                checked={rtcEnabled}
                onCheckedChange={onToggleRtc}
                aria-label={rtcEnabled ? 'Desativar OpenCall para todo mundo' : 'Ativar OpenCall para todo mundo'}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {rtcEnabled ? 'Desativar OpenCall para todo mundo' : 'Ativar OpenCall para todo mundo'}
          </TooltipContent>
        </Tooltip>
      )} */}

      <InviteToChannelsModal open={inviteOpen} onOpenChange={setInviteOpen} user={user} />
      <LoginQrModal open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

function ChannelsDisabledBanner() {
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2 opacity-60">
      <HugeIcon name="mic-off-02" size={15} className="shrink-0 text-muted-foreground" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canais de voz desligados</span>
    </div>
  );
}

/** Único canal de texto do app — sem estado de conexão, só navegação até o content à direita da sidebar. */
function BatePapoLink() {
  const pathname = usePathname();
  const active = pathname === routeNames.CHANNEL_TEXT;
  const { count, displayCount, mentionCount, mentionDisplayCount } = useChatUnread();

  return (
    <Link
      href={routeNames.CHANNEL_TEXT}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] font-semibold transition-colors hover:bg-muted/40',
        active ? 'bg-muted/40 text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <HugeIcon name="hashtag" size={19} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">Bate-papo</span>
      {count > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
              {displayCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{count === 1 ? '1 mensagem não lida' : `${count} mensagens não lidas`}</TooltipContent>
        </Tooltip>
      )}
      {mentionCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="shrink-0 px-1.5 py-0 text-[10px]">
              {mentionDisplayCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{mentionCount === 1 ? 'Você foi mencionado 1 vez' : `Você foi mencionado ${mentionCount} vezes`}</TooltipContent>
        </Tooltip>
      )}
    </Link>
  );
}

/**
 * 3 estados possíveis, nessa ordem de prioridade: sem sessão mostra os
 * botões de login (não tem usuário nem canal pra mostrar dock nenhum); com
 * sessão e conectado num canal mostra o SelfControlCard; com sessão e fora
 * de um canal mostra o card de avatar + configurações de dispositivo.
 */
function SidebarFooter({
  authenticated,
  user,
  connectedChannelId,
  joining,
}: {
  authenticated: boolean;
  user: UserDTO | null;
  connectedChannelId: string | null;
  joining: boolean;
}) {
  if (!authenticated) {
    return (
      <div className="flex shrink-0 flex-col gap-2 p-2">
        <QrLoginButton />
        <DiscordOAuth />
      </div>
    );
  }

  if (connectedChannelId) {
    const channelName = CHANNEL_LIST.find((c) => c.id === connectedChannelId)?.name ?? '';
    return <SelfControlCard channelName={channelName} user={user} />;
  }

  const name = user?.username || 'Você';

  return (
    <div className="shrink-0 p-2 relative rounded-2xl overflow-hidden bg-gradient-to-tr from-muted to-accent/10">
      <Avatar image={user?.avatar} className='absolute top-1/2 -translate-y-1/2 left-0 blur-lg pointer-events-none z-1' fallback={name.slice(0, 2)} size={24} />
      <div className="flex items-center gap-2 relative z-2">
        <Avatar image={user?.avatar} fallback={name.slice(0, 2)} size={10} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{name}</div>
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            {joining && <HugeIcon name="loading-03" size={12} className="animate-spin" />}
            {joining && 'Conectando…'}
          </div>
        </div>
        <VoiceDeviceSettingsPopover
          tooltip="Configurações de dispositivos"
          trigger={
            <Button type="button" size="icon" variant="secondary" aria-label="Dispositivos de áudio">
              <HugeIcon name="settings-01" size={19} />
            </Button>
          }
        />
      </div>
    </div>
  );
}

/**
 * Sidebar fixa da experiência de canais (hoje a própria home): monta uma vez
 * no layout e persiste entre navegações dentro da seção (texto <-> canais de
 * voz) — só o conteúdo à direita muda.
 */
export default function VoiceChannelSidebar({ user }: { user: UserDTO | null }) {
  const { data: session, status: sessionStatus } = useSession();
  const authenticated = sessionStatus === 'authenticated';
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const isChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);
  const { rtcEnabled, setRtcEnabled } = useRtcEnabled(true);
  const { status, channel: voiceChannel } = useVoice();
  const connectedChannelId = status === 'connected' ? (voiceChannel?.id ?? null) : null;
  const joining = status === 'connecting';
  // No mobile o texto abre em tela cheia por cima da lista de canais (ver
  // TextChannelView), então a lista fica sem espaço e some — a lista só
  // volta ao apertar o goback no header do bate-papo (volta pra home).
  // Canais de voz não entram nessa troca: ConnectedChannelRow já mostra os
  // participantes inline na própria lista, então ela continua sendo "a tela".
  const hiddenOnMobile = isMobile && pathname === routeNames.CHANNEL_TEXT;

  useEffect(() => {
    // Pede a permissão de microfone assim que o usuário entra na seção de
    // canais, antes mesmo de clicar em "Entrar" numa sala. Assim o prompt do
    // navegador já foi resolvido (aceito ou negado) quando o join de verdade
    // acontece, em vez de travar no meio da conexão do LiveKit. Sem sessão
    // ainda nem dá pra entrar num canal, então não faz sentido pedir o mic
    // de quem só está de passagem, deslogado.
    if (!authenticated) return;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => { });
  }, [authenticated]);

  return (
    <div
      className={cn(
        'w-full shrink-0 flex-col bg-card min-[900px]:flex min-[900px]:w-[300px] p-2',
        hiddenOnMobile ? 'hidden' : 'flex'
      )}
    >
      <ScrollArea className="flex-1">
        <RtcHeader isAdmin={isAdmin} rtcEnabled={rtcEnabled} onToggleRtc={setRtcEnabled} user={user} />

        <div className="px-2 mt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canais de texto</div>
        <BatePapoLink />

        <div className="mt-6 px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canais de voz</div>
        {rtcEnabled ? (
          <VoiceChannelsSection rtcEnabled={rtcEnabled} user={user} isChannelsAdmin={isChannelsAdmin} isFullAdmin={isAdmin} />
        ) : (
          <ChannelsDisabledBanner />
        )}
      </ScrollArea>

      <SidebarFooter authenticated={authenticated} user={user} connectedChannelId={connectedChannelId} joining={joining} />
    </div>
  );
}
