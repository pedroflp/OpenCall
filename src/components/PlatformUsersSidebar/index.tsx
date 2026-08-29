'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Avatar from '@/components/Avatar';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HugeIcon } from '@/components/HugeIcon';
import { PlatformUsersSidebarSkeleton } from './Skeleton';
import { usePlatformPresenceUsers } from '@/hooks/usePlatformPresenceUsers';
import { useCallAction, type CallStatus } from '@/hooks/useCallAction';
import { useRingAction, type RingStatus } from '@/hooks/useRingAction';
import { useChatBlockAction } from '@/hooks/useChatBlockAction';
import type { PresenceStatus, PlatformPresenceUser } from '@/lib/presence/platformPresence';
import type { GroupDTO } from '@/app/api/groups/types';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Ausente',
  offline: 'Offline',
};

const STATUS_DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-green-500',
  away: 'bg-orange-500',
  offline: 'bg-zinc-500',
};

const STATUS_ORDER: Record<PresenceStatus, number> = { online: 0, away: 1, offline: 2 };

/** awaySince só muda no instante da transição (ver resolveAwaySince), então o snapshot fica idêntico poll após poll enquanto alguém segue away/offline — sem isso o texto relativo ("há X min") congela. */
const RELATIVE_LABEL_REFRESH_MS = 30_000;

function formatLastActive(lastActiveAt?: string): string | null {
  if (!lastActiveAt) return null;
  return formatDistanceToNow(new Date(lastActiveAt), { locale: ptBR, addSuffix: true });
}

/** Sem lastActiveAt vai pro fim do próprio status — nunca visto ainda não é "recente". */
function lastActiveTime(user: PlatformPresenceUser): number {
  return user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : -Infinity;
}

/** Dentro de cada status (online/ausente/offline), quem esteve ativo mais recentemente aparece primeiro. */
function sortByStatus(users: PlatformPresenceUser[]): PlatformPresenceUser[] {
  return [...users].sort(
    (a, b) => STATUS_ORDER[a.activeStatus] - STATUS_ORDER[b.activeStatus] || lastActiveTime(b) - lastActiveTime(a),
  );
}

/** Grupos ordenados por sortIndex, cada um com seus membros; quem não tem grupo cai no bucket "rest" (sem grupo geral). */
function bucketUsersByGroup(
  users: PlatformPresenceUser[],
  groups: GroupDTO[],
): { group: GroupDTO; members: PlatformPresenceUser[] }[] {
  return groups
    .map((group) => ({ group, members: sortByStatus(users.filter((user) => user.groups.includes(group.id))) }))
    .filter((bucket) => bucket.members.length > 0);
}

function PresenceAvatar({ avatar, username, status }: { avatar: string; username: string; status: PresenceStatus }) {
  return (
    <div className="relative shrink-0">
      <Avatar
        image={avatar}
        fallback={username.slice(0, 2)}
        size={9}
        className={cn(status === 'offline' && 'opacity-40')}
      />
      <span
        role="img"
        aria-label={STATUS_LABEL[status]}
        className={cn(
          'absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-background',
          STATUS_DOT_CLASS[status],
        )}
      />
    </div>
  );
}

const CALL_LABEL: Record<CallStatus, string> = {
  idle: 'Chamar no Discord',
  sending: 'Chamando...',
  cooldown: 'Chamado',
};

function CallAction({ targetUserId }: { targetUserId: string }) {
  const { status, remainingMs, call } = useCallAction(targetUserId);
  const disabled = status !== 'idle';

  const button = (
    <button
      type="button"
      onClick={() => void call()}
      aria-disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <HugeIcon name="waving-hand-01" size={16} />
      {CALL_LABEL[status]}
    </button>
  );

  if (status !== 'cooldown') return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="left">Aguarde {Math.ceil(remainingMs / 1000)}s pra chamar de novo</TooltipContent>
    </Tooltip>
  );
}

const RING_LABEL: Record<RingStatus, string> = {
  idle: 'Ligar para entrar',
  'no-channel': 'Ligar para entrar',
  'already-in-room': 'Ligar para entrar',
  ringing: 'Chamando...',
  cooldown: 'Chamado',
  rejected: 'Recusado',
};

/** Só faz sentido pra quem já está online/ausente na plataforma — offline não recebe nada em tempo real (ver useRingAction). */
function RingToJoinAction({ targetUserId, targetVoiceChannelId }: { targetUserId: string; targetVoiceChannelId?: string }) {
  const { status, remainingMs, ring } = useRingAction(targetUserId, targetVoiceChannelId);
  const disabled = status !== 'idle';

  const button = (
    <button
      type="button"
      onClick={() => void ring()}
      aria-disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <HugeIcon name="call-outgoing-01" size={16} />
      {RING_LABEL[status]}
    </button>
  );

  if (status === 'no-channel') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="left">Entre em um canal de voz primeiro</TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'already-in-room') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="left">Usuário já está na sua sala</TooltipContent>
      </Tooltip>
    );
  }

  if (status !== 'cooldown' && status !== 'rejected') return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="left">Aguarde {Math.ceil(remainingMs / 1000)}s pra ligar de novo</TooltipContent>
    </Tooltip>
  );
}

/** Toggle de bloqueio de envio no chat — só aparece pra channels_admin (ver hasChannelsAdminAccess), mesma régua do /clear e do kick de voz. */
function ChatBlockAction({ targetUserId, blocked, onDone }: { targetUserId: string; blocked: boolean; onDone: () => void }) {
  const { pending, toggle } = useChatBlockAction(targetUserId, blocked);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void toggle();
        onDone();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        blocked ? 'text-muted-foreground hover:bg-secondary' : 'text-destructive hover:bg-destructive/10',
      )}
    >
      <HugeIcon name={blocked ? 'chat-done-01' : 'chat-lock'} size={16} />
      {blocked ? 'Liberar no chat' : 'Bloquear no chat'}
    </button>
  );
}

function PlatformUserRow({
  user,
  textColor,
  currentUserId,
  viewerIsChannelsAdmin,
}: {
  user: PlatformPresenceUser;
  textColor?: string;
  currentUserId?: string;
  viewerIsChannelsAdmin: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const showMenu = user.id !== currentUserId;
  const lastActiveLabel = formatLastActive(user.lastActiveAt);
  // Só reflete o estado da MINHA própria ligação (outgoingCallTargetId vive no
  // CallProvider deste client) — quem recebe a ligação nunca vê isso na lista.
  const { status: ringStatus } = useRingAction(user.id, user.voiceChannelId);

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverAnchor asChild>
        <li
          className={cn(
            'flex items-center gap-3 rounded-lg px-2 py-1.5',
            user.activeStatus === 'offline' && 'opacity-60',
            showMenu && 'cursor-pointer hover:bg-secondary/50',
          )}
          onClick={() => {
            if (!showMenu) return;
            setMenuOpen(true);
          }}
          onContextMenu={(event) => {
            if (!showMenu) return;
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          <PresenceAvatar avatar={user.avatar} username={user.username} status={user.activeStatus} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-md font-medium text-muted-foreground" style={textColor ? { color: textColor } : undefined}>
                {user.username}
              </span>
              {ringStatus === 'ringing' && (
                <HugeIcon
                  name="call-ringing-01"
                  size={13}
                  aria-label="Chamando"
                  className="shrink-0 animate-wiggle-loop text-green-600"
                />
              )}
            </div>
            {ringStatus === 'rejected' ? (
              <span className="flex items-center gap-1 truncate text-[11px] text-destructive">
                <HugeIcon name="call-end-01" size={11} className="shrink-0" />
                Recusado
              </span>
            ) : (
              lastActiveLabel && (
                <span className="block truncate text-[11px] text-muted-foreground/60">{lastActiveLabel}</span>
              )
            )}
          </div>
        </li>
      </PopoverAnchor>

      {showMenu && (
        <PopoverContent align="start" className="w-56 border-0 p-1">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={8} />
            <span className="truncate text-sm font-medium">{user.username}</span>
          </div>

          <Separator className="my-1" />

          {user.activeStatus !== 'offline' && (
            <RingToJoinAction targetUserId={user.id} targetVoiceChannelId={user.voiceChannelId} />
          )}
          <CallAction targetUserId={user.id} />

          {viewerIsChannelsAdmin && (
            <>
              <Separator className="my-1" />
              <ChatBlockAction targetUserId={user.id} blocked={user.chatBlocked} onDone={() => setMenuOpen(false)} />
            </>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

export default function PlatformUsersSidebar() {
  const { data: session } = useSession();
  const { users, groups, loading } = usePlatformPresenceUsers();
  const currentUserId = session?.user?.id;
  const viewerIsChannelsAdmin = Boolean(session?.user?.isChannelsAdmin);

  const [, forceRelabel] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRelabel((tick) => tick + 1), RELATIVE_LABEL_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const groupBuckets = bucketUsersByGroup(users, groups);
  const groupedIds = new Set(groupBuckets.flatMap((bucket) => bucket.members.map((member) => member.id)));
  const rest = sortByStatus(users.filter((user) => !groupedIds.has(user.id)));

  if (loading) return <PlatformUsersSidebarSkeleton />;

  return (
    <aside className="hidden lg:flex w-60 mt-4 shrink-0 flex-col overflow-hidden bg-card">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {groupBuckets.map(({ group, members }) => (
          <div key={group.id} className="mb-3">
            <div className={cn("px-2 pb-1 text-xs font-bold uppercase tracking-widest, opacity-60")} style={group.textColor ? { color: group.textColor } : undefined}>
              {group.title}
            </div>
            <ul className="flex flex-col gap-1 mt-2">
              {members.map((user) => (
                <PlatformUserRow
                  key={user.id}
                  user={user}
                  textColor={group.textColor}
                  currentUserId={currentUserId}
                  viewerIsChannelsAdmin={viewerIsChannelsAdmin}
                />
              ))}
            </ul>
          </div>
        ))}

        <ul className="flex flex-col gap-1 mt-6">
          <div className={cn("px-2 pb-1 text-xs opacity-60 text-muted-foreground uppercase tracking-wider")}>
            Geral
          </div>
          {rest.map((user) => (
            <PlatformUserRow key={user.id} user={user} currentUserId={currentUserId} viewerIsChannelsAdmin={viewerIsChannelsAdmin} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
