'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChannelType } from '@prisma/client';
import { useVoice } from '@/providers/VoiceProvider';
import { useChannelPresence } from '@/hooks/useChannelPresence';
import { useChatUnread } from '@/hooks/useChatUnread';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRtcEnabled } from '@/hooks/useRtcEnabled';
import { useVoiceChannels, useTextChannels, beginChannelDelete } from '@/hooks/useChannels';
// Type-only: apagado na compilação, não puxa lib/rtc/channels (Prisma) pro bundle client.
import type { Channel } from '@/lib/rtc/channels';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';
import DiscordOAuth from '@/components/DiscordOAuth';
import QrLoginButton from '@/components/QrLoginButton';
import DeleteChannelDialog from '@/flows/admin/channels/DeleteChannelDialog';
import InviteToChannelsModal from './InviteToChannelsModal';
import ChannelDialog from './ChannelDialog';
import DevicePairingModal from '@/components/DevicePairingModal';
import ParticipantTile from './ParticipantTile';
import PreviewParticipantsList from './PreviewParticipantsList';
import SelfControlCard from './SelfControlCard';
import VoiceDeviceSettingsPopover from './VoiceDeviceSettingsPopover';

/**
 * Popover de clique secundário num canal (só pra channels_admin), com editar
 * e excluir — reaproveita os diálogos do painel admin (mesma API, mesmo
 * double-check de exclusão).
 *
 * O PopoverAnchor fica num <div> próprio, NUNCA direto na linha: o `Link` de
 * next-view-transitions é uma função simples, sem forwardRef, então um
 * `asChild` em cima dele perde a ref e o Radix fica sem elemento pra ancorar
 * — o popover simplesmente não abria em nenhuma linha que fosse Link (todo
 * canal de texto e todo canal de voz desconectado). O wrapper também tira o
 * botão "⋮" de dentro do <a> (button dentro de anchor é HTML inválido).
 *
 * Os dois diálogos ficam FORA do PopoverContent de propósito: um Popover
 * fechado desmonta o Content do DOM, e se o diálogo morasse dentro dele,
 * fechar o popover pra abrir o diálogo desmontava o diálogo junto no mesmo
 * tick — ele piscava e sumia antes de aparecer de verdade. Por isso os dois
 * ficam como siblings sempre montados, com open/onOpenChange controlados
 * aqui em vez do trigger próprio de cada um.
 */
function ChannelContextMenu({
  channel,
  isChannelsAdmin,
  tooltip,
  children,
}: {
  channel: Channel;
  isChannelsAdmin: boolean;
  tooltip?: string;
  children: (handlers: { onContextMenu: (event: React.MouseEvent) => void }) => React.ReactElement;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onContextMenu = (event: React.MouseEvent) => {
    if (!isChannelsAdmin) return;
    event.preventDefault();
    setMenuOpen(true);
  };

  const isText = channel.type === ChannelType.TEXT;

  function handleDeleted() {
    setDeleteOpen(false);
    beginChannelDelete(channel);

    // Apagar o canal que está aberto no centro deixaria a tela num id que não
    // existe mais ("Canal não encontrado"). Manda pro alias do canal padrão,
    // que resolve pro primeiro da lista — e, se não sobrar nenhum, cai no
    // empty state de "crie o primeiro canal" (ver NoChannelsEmptyState).
    const viewing = pathname === (isText ? routeNames.CHANNEL_TEXT_ID(channel.id) : routeNames.CHANNEL(channel.id));
    if (viewing) router.replace(isText ? routeNames.CHANNEL_TEXT : routeNames.HOME);
    router.refresh();
  }

  const anchored = (
    <PopoverAnchor asChild>
      <div className="group relative flex items-center">
        {children({ onContextMenu })}
        {isChannelsAdmin && <ChannelMenuButton onOpen={() => setMenuOpen(true)} />}
      </div>
    </PopoverAnchor>
  );

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{anchored}</TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          anchored
        )}

        {isChannelsAdmin && (
          <PopoverContent align="end" className="w-48 border-0 p-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setEditOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <HugeIcon name="pencil-edit-01" size={16} />
              Editar canal
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <HugeIcon name="delete-02" size={16} />
              Excluir canal
            </button>
          </PopoverContent>
        )}
      </Popover>

      {isChannelsAdmin && (
        <>
          <ChannelDialog channel={channel} open={editOpen} onOpenChange={setEditOpen} onSaved={() => setEditOpen(false)} />
          <DeleteChannelDialog channel={channel} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={handleDeleted} />
        </>
      )}
    </>
  );
}

/**
 * Botão "⋮" que aparece no hover da linha (via `group` no wrapper de
 * ChannelContextMenu) — mesmo popover do clique direito, só que descobrível
 * sem precisar saber que dá pra clicar com o botão direito num canal.
 *
 * Fica absoluto no canto direito pra dividir o mesmo slot do badge de limite,
 * que some no hover (ver ChannelLimitBadge). As linhas ganham `group-hover:pr-7`
 * pra o resto do conteúdo (stack de participantes, "AO VIVO", badges de não
 * lida) sair de baixo do botão em vez de ficar coberto.
 */
function ChannelMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      className="invisible absolute right-1 top-1/2 shrink-0 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground group-hover:visible focus-visible:visible"
      aria-label="Opções do canal"
    >
      <HugeIcon name="more-vertical" size={16} />
    </button>
  );
}

/** Badge do limite de participantes (só voice, ver ADR-0001) — mostrado no fim da linha do nome do canal. `null` é canal sem limite: não mostra badge nenhum. */
function ChannelLimitBadge({ maxParticipants, currentCount }: { maxParticipants: number | null; currentCount: number }) {
  if (maxParticipants === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums">
          {currentCount > 0 ? `${currentCount}/${maxParticipants}` : maxParticipants}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Limite de usuários</TooltipContent>
    </Tooltip>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Header rico de um canal de voz: usado tanto pra quem está conectado nele quanto pra quem está só olhando a página dele (clique entra). */
function ChannelHeader({
  channel,
  onNameClick,
  href,
  tooltip = 'Entrar no canal',
  connected,
  isChannelsAdmin,
  participantCount,
}: {
  channel: Channel;
  onNameClick?: () => void;
  href?: string;
  tooltip?: string;
  connected: boolean;
  isChannelsAdmin: boolean;
  participantCount: number;
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
        <span className={cn('min-w-0 truncate text-[15px] font-semibold', !connected && 'text-muted-foreground')}>{channel.name}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cn('shrink-0', isChannelsAdmin && 'group-hover:hidden')}>
          <ChannelLimitBadge maxParticipants={channel.maxParticipants} currentCount={participantCount} />
        </span>
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

  const rowClassName = cn(
    'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40',
    isChannelsAdmin && 'group-hover:pr-7',
    connected && 'bg-muted/40 hover:bg-muted/60'
  );

  return (
    <ChannelContextMenu channel={channel} isChannelsAdmin={isChannelsAdmin} tooltip={href || onNameClick ? tooltip : undefined}>
      {({ onContextMenu }) => {
        if (href) {
          return (
            <Link href={href} onContextMenu={onContextMenu} className={rowClassName}>
              {content}
            </Link>
          );
        }

        if (onNameClick) {
          return (
            <button type="button" onClick={onNameClick} onContextMenu={onContextMenu} className={rowClassName}>
              {content}
            </button>
          );
        }

        return (
          <div
            onContextMenu={onContextMenu}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5',
              isChannelsAdmin && 'group-hover:pr-7',
              connected && 'bg-muted/40'
            )}
          >
            {content}
          </div>
        );
      }}
    </ChannelContextMenu>
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
function ChannelListItem({
  channel,
  rtcEnabled,
  isChannelsAdmin,
}: {
  channel: Channel;
  rtcEnabled: boolean;
  isChannelsAdmin: boolean;
}) {
  const presence = useChannelPresence(channel.id, rtcEnabled);
  const { join } = useVoice();
  const streamer = presence.participants.find((participant) => participant.isStreaming);

  return (
    <ChannelContextMenu channel={channel} isChannelsAdmin={isChannelsAdmin} tooltip="Entrar no canal">
      {({ onContextMenu }) => (
        <Link
          href={routeNames.CHANNEL(channel.id)}
          onClick={() => void join(channel.id)}
          onContextMenu={onContextMenu}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
            isChannelsAdmin && 'group-hover:pr-7'
          )}
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
          <span className={cn('shrink-0', isChannelsAdmin && 'group-hover:hidden')}>
            <ChannelLimitBadge maxParticipants={channel.maxParticipants} currentCount={presence.participants.length} />
          </span>
        </Link>
      )}
    </ChannelContextMenu>
  );
}

/** Canal em que estamos de fato conectados agora (independente da página que está sendo vista): header rico + participantes ao vivo. */
function ConnectedChannelRow({ channel, isChannelsAdmin }: { channel: Channel; isChannelsAdmin: boolean }) {
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
        channel={channel}
        href={onOwnPage ? undefined : routeNames.CHANNEL(channel.id)}
        tooltip="Voltar para o canal"
        connected
        isChannelsAdmin={isChannelsAdmin}
        participantCount={participants.length}
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
      <ChannelHeader
        channel={channel}
        onNameClick={joining ? undefined : onJoin}
        connected={false}
        isChannelsAdmin={isChannelsAdmin}
        participantCount={presence.participants.length}
      />
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

/**
 * Linha de canal em trânsito: criação ainda voando (id temporário) ou
 * exclusão já confirmada esperando a lista recarregar — ver o store de
 * pendências em useChannels. É estática de propósito: um id que ainda não
 * existe (ou que acabou de deixar de existir) não tem presença nem contagem
 * de não lidas pra buscar, e clicar nele não deveria levar a lugar nenhum.
 */
function PendingChannelRow({ channel }: { channel: Channel }) {
  return (
    <div className="pointer-events-none relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] font-semibold text-muted-foreground opacity-50">
      <HugeIcon name={channel.type === ChannelType.VOICE ? 'volume-high' : 'hashtag'} size={19} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg bg-[linear-gradient(110deg,transparent_35%,hsl(var(--foreground)/0.35)_50%,transparent_65%)] bg-[length:200%_100%] animate-shine"
      />
    </div>
  );
}

function VoiceChannelsSection({
  channels,
  pendingIds,
  rtcEnabled,
  user,
  isChannelsAdmin,
  isFullAdmin,
}: {
  channels: Channel[];
  pendingIds: Set<string>;
  rtcEnabled: boolean;
  user: UserDTO | null;
  isChannelsAdmin: boolean;
  isFullAdmin: boolean;
}) {
  const pathname = usePathname();
  const { status, channel: voiceChannel, join } = useVoice();
  const connectedChannelId = status === 'connected' ? (voiceChannel?.id ?? null) : null;
  const joining = status === 'connecting';

  const activePageChannel = channels.find((c) => pathname === routeNames.CHANNEL(c.id));
  const activePageChannelId = activePageChannel ? activePageChannel.id : pathname === routeNames.CHANNELS ? (channels[0]?.id ?? null) : null;

  return (
    <div className="flex flex-col gap-0.5">
      {channels.map((channel) => {
        if (pendingIds.has(channel.id)) return <PendingChannelRow key={channel.id} channel={channel} />;

        if (channel.id === connectedChannelId) {
          return <ConnectedChannelRow key={channel.id} channel={channel} isChannelsAdmin={isChannelsAdmin} />;
        }

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

        return (
          <ChannelListItem key={channel.id} channel={channel} rtcEnabled={rtcEnabled} isChannelsAdmin={isChannelsAdmin} />
        );
      })}
    </div>
  );
}

function RtcHeader({
  isAdmin,
  isChannelsAdmin,
  rtcEnabled,
  onToggleRtc,
  user,
}: {
  isAdmin: boolean;
  isChannelsAdmin: boolean;
  rtcEnabled: boolean;
  onToggleRtc: (enabled: boolean) => void;
  user: UserDTO | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);

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
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPairingOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <HugeIcon name="qr-code-01" size={16} />
              Entrar em outro dispositivo
            </button>
          </PopoverContent>
        </Popover>
      </div>
      {isChannelsAdmin && (
        <ChannelDialog
          defaultType={ChannelType.TEXT}
          tooltip="Criar canal"
          trigger={
            <Button type="button" variant="ghost" size="icon" className="-mr-2 h-7 w-7" aria-label="Criar canal">
              <HugeIcon name="add-01" size={16} />
            </Button>
          }
        />
      )}

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
      <DevicePairingModal open={pairingOpen} onOpenChange={setPairingOpen} />
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

/** Uma linha de canal de texto — mesmo padrão visual que a badge de voz (ver ChannelParticipantsStack/"AO VIVO"), sem estado de conexão: só navegação até o content à direita da sidebar. */
function TextChannelRow({
  channel,
  active,
  isChannelsAdmin,
}: {
  channel: Channel;
  active: boolean;
  isChannelsAdmin: boolean;
}) {
  const { count, displayCount, mentionCount, mentionDisplayCount } = useChatUnread(channel.id);

  return (
    <ChannelContextMenu channel={channel} isChannelsAdmin={isChannelsAdmin}>
      {({ onContextMenu }) => (
        <Link
          href={routeNames.CHANNEL_TEXT_ID(channel.id)}
          onContextMenu={onContextMenu}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] font-semibold transition-colors hover:bg-muted/40',
            isChannelsAdmin && 'group-hover:pr-7',
            active ? 'bg-muted/40 text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <HugeIcon name="hashtag" size={19} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{channel.name}</span>
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
      )}
    </ChannelContextMenu>
  );
}

/** Lista de canais de texto — mesmo padrão da seção de voz (ver VoiceChannelsSection), com badge de não-lida por canal. */
function TextChannelsSection({
  channels,
  pendingIds,
  isChannelsAdmin,
}: {
  channels: Channel[];
  pendingIds: Set<string>;
  isChannelsAdmin: boolean;
}) {
  const pathname = usePathname();
  const defaultChannelId = channels[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-0.5">
      {channels.map((channel) => {
        if (pendingIds.has(channel.id)) return <PendingChannelRow key={channel.id} channel={channel} />;

        const active =
          pathname === routeNames.CHANNEL_TEXT_ID(channel.id) ||
          (pathname === routeNames.CHANNEL_TEXT && channel.id === defaultChannelId);
        return <TextChannelRow key={channel.id} channel={channel} active={active} isChannelsAdmin={isChannelsAdmin} />;
      })}
    </div>
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
  voiceChannels,
  connectedChannelId,
  joining,
}: {
  authenticated: boolean;
  user: UserDTO | null;
  voiceChannels: Channel[];
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
    const channelName = voiceChannels.find((c) => c.id === connectedChannelId)?.name ?? '';
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
  // Exige o DTO do Postgres, não só o cookie JWT válido: um cookie de sessão
  // sobrevive a um reset de banco (dev) ou a um usuário apagado (prod), e sem
  // a linha em `user` não tem conta de verdade pra mostrar — só o botão de
  // login de novo, não o card autenticado com nome "Você" de fallback.
  const authenticated = sessionStatus === 'authenticated' && user !== null;
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const isChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);
  const { rtcEnabled, setRtcEnabled } = useRtcEnabled(true);
  const { status, channel: voiceChannel } = useVoice();
  const connectedChannelId = status === 'connected' ? (voiceChannel?.id ?? null) : null;
  const joining = status === 'connecting';
  const { channels: voiceChannels, pendingIds: pendingVoiceIds } = useVoiceChannels();
  const { channels: textChannels, pendingIds: pendingTextIds } = useTextChannels();
  // No mobile o texto abre em tela cheia por cima da lista de canais (ver
  // TextChannelView), então a lista fica sem espaço e some — a lista só
  // volta ao apertar o goback no header do bate-papo (volta pra home).
  // Canais de voz não entram nessa troca: ConnectedChannelRow já mostra os
  // participantes inline na própria lista, então ela continua sendo "a tela".
  const hiddenOnMobile = isMobile && (pathname === routeNames.CHANNEL_TEXT || pathname.startsWith('/text/'));

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
        <RtcHeader isAdmin={isAdmin} isChannelsAdmin={isChannelsAdmin} rtcEnabled={rtcEnabled} onToggleRtc={setRtcEnabled} user={user} />

        <div className="px-2 mt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canais de texto</div>
        <TextChannelsSection channels={textChannels} pendingIds={pendingTextIds} isChannelsAdmin={isChannelsAdmin} />

        <div className="mt-6 px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canais de voz</div>
        {rtcEnabled ? (
          <VoiceChannelsSection
            channels={voiceChannels}
            pendingIds={pendingVoiceIds}
            rtcEnabled={rtcEnabled}
            user={user}
            isChannelsAdmin={isChannelsAdmin}
            isFullAdmin={isAdmin}
          />
        ) : (
          <ChannelsDisabledBanner />
        )}
      </ScrollArea>

      <SidebarFooter
        authenticated={authenticated}
        user={user}
        voiceChannels={voiceChannels}
        connectedChannelId={connectedChannelId}
        joining={joining}
      />
    </div>
  );
}
