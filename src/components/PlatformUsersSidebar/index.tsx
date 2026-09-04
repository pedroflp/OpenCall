'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { useTranslations } from 'next-intl';
import Avatar from '@/components/Avatar';
import { useDateFnsLocale } from '@/i18n/dateFns';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HugeIcon } from '@/components/HugeIcon';
import { PlatformUsersSidebarSkeleton } from './Skeleton';
import { usePlatformPresenceUsers } from '@/hooks/usePlatformPresenceUsers';
import { useRingAction, type RingStatus } from '@/hooks/useRingAction';
import { useChatBlockAction } from '@/hooks/useChatBlockAction';
import type { PresenceStatus, PlatformPresenceUser } from '@/lib/presence/platformPresence';
import type { GroupDTO } from '@/app/api/groups/types';
import { cn } from '@/lib/utils';

const STATUS_DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-green-500',
  away: 'bg-orange-500',
  offline: 'bg-zinc-500',
};

const STATUS_ORDER: Record<PresenceStatus, number> = { online: 0, away: 1, offline: 2 };

/** awaySince só muda no instante da transição (ver resolveAwaySince), então o snapshot fica idêntico poll após poll enquanto alguém segue away/offline — sem isso o texto relativo ("há X min") congela. */
const RELATIVE_LABEL_REFRESH_MS = 30_000;

/**
 * `locale` entra por parâmetro (e não fixo em `ptBR`, como era) porque o "há 5
 * minutos" tem que virar "5 minutes ago" junto com o resto da interface — quem
 * chama pega o locale do `date-fns` com `useDateFnsLocale`.
 */
function formatLastActive(lastActiveAt: string | undefined, locale: DateFnsLocale): string | null {
  if (!lastActiveAt) return null;
  return formatDistanceToNow(new Date(lastActiveAt), { locale, addSuffix: true });
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
  const t = useTranslations('presence');

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
        aria-label={t(`status.${status}`)}
        className={cn(
          'absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-background',
          STATUS_DOT_CLASS[status],
        )}
      />
    </div>
  );
}

/**
 * Três estados diferentes mostram o MESMO rótulo ("Ligar para entrar") — o que
 * muda entre eles é só o tooltip que explica por que o botão está apagado, e é
 * por isso que essa tabela existe: ela colapsa seis estados em quatro chaves.
 */
const RING_LABEL = {
  idle: 'idle',
  'no-channel': 'idle',
  'already-in-room': 'idle',
  ringing: 'ringing',
  cooldown: 'cooldown',
  rejected: 'rejected',
} as const satisfies Record<RingStatus, string>;

/** Só faz sentido pra quem já está online/ausente na plataforma — offline não recebe nada em tempo real (ver useRingAction). */
function RingToJoinAction({ targetUserId, targetVoiceChannelId }: { targetUserId: string; targetVoiceChannelId?: string }) {
  const t = useTranslations('presence.ring');
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
      {t(RING_LABEL[status])}
    </button>
  );

  if (status === 'no-channel') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="left">{t('noChannelTooltip')}</TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'already-in-room') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="left">{t('alreadyInRoomTooltip')}</TooltipContent>
      </Tooltip>
    );
  }

  if (status !== 'cooldown' && status !== 'rejected') return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="left">{t('cooldownTooltip', { seconds: Math.ceil(remainingMs / 1000) })}</TooltipContent>
    </Tooltip>
  );
}

/** Toggle de bloqueio de envio no chat — só aparece pra channels_admin (ver hasChannelsAdminAccess), mesma régua do /clear e do kick de voz. */
function ChatBlockAction({ targetUserId, blocked, onDone }: { targetUserId: string; blocked: boolean; onDone: () => void }) {
  const t = useTranslations('presence.chatBlock');
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
      {blocked ? t('unblock') : t('block')}
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
  const t = useTranslations('presence');
  const dateFnsLocale = useDateFnsLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  // Sem ação nenhuma dentro, o popover seria só o cabeçalho com o nome que a
  // linha já mostra — por isso o menu depende de haver ao menos uma: ligar
  // (só pra quem não está offline) ou bloquear o chat (só pra channels_admin).
  const showMenu = user.id !== currentUserId && (user.activeStatus !== 'offline' || viewerIsChannelsAdmin);
  const lastActiveLabel = formatLastActive(user.lastActiveAt, dateFnsLocale);
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
                  aria-label={t('ringingBadge')}
                  className="shrink-0 animate-wiggle-loop text-green-600"
                />
              )}
            </div>
            {ringStatus === 'rejected' ? (
              <span className="flex items-center gap-1 truncate text-[11px] text-destructive">
                <HugeIcon name="call-end-01" size={11} className="shrink-0" />
                {t('rejectedBadge')}
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
            <>
              <RingToJoinAction targetUserId={user.id} targetVoiceChannelId={user.voiceChannelId} />
              {/* Separador só entre DUAS seções — com o alvo offline o bloqueio
                  de chat é o único item, e ele já vem logo abaixo do cabeçalho. */}
              {viewerIsChannelsAdmin && <Separator className="my-1" />}
            </>
          )}

          {viewerIsChannelsAdmin && (
            <ChatBlockAction targetUserId={user.id} blocked={user.chatBlocked} onDone={() => setMenuOpen(false)} />
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

export default function PlatformUsersSidebar() {
  const t = useTranslations('presence');
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
            {t('general')}
          </div>
          {rest.map((user) => (
            <PlatformUserRow key={user.id} user={user} currentUserId={currentUserId} viewerIsChannelsAdmin={viewerIsChannelsAdmin} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
