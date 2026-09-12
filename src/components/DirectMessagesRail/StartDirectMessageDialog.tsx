'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Avatar from '@/components/Avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ui/search-field';
import { usePlatformPresenceUsers } from '@/hooks/usePlatformPresenceUsers';
import { refreshDirectConversations, useDirectConversations } from '@/hooks/useDirectConversations';
import type { PresenceStatus, PlatformPresenceUser } from '@/lib/presence/platformPresence';
import type { GroupDTO } from '@/app/api/groups/types';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';

/**
 * "Command palette" de iniciar DM: abre centralizada (Dialog, não popover
 * ancorado), organizada em seções — Recentes (quem já tem conversa, mais
 * recente primeiro), cada grupo da plataforma, e Geral pra quem sobra — mesmo
 * agrupamento de PlatformUsersSidebar.
 *
 * Seta cima/baixo navega a lista INTEIRA (atravessa seção), Enter abre a
 * conversa com quem está selecionado, Esc fecha (grátis do Dialog do Radix).
 */

const STATUS_ORDER: Record<PresenceStatus, number> = { online: 0, away: 1, offline: 2 };

function lastActiveTime(user: PlatformPresenceUser): number {
  return user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : -Infinity;
}

/** Mesmo critério de PlatformUsersSidebar: dentro do status, mais recente primeiro. */
function sortByStatus(users: PlatformPresenceUser[]): PlatformPresenceUser[] {
  return [...users].sort(
    (a, b) => STATUS_ORDER[a.activeStatus] - STATUS_ORDER[b.activeStatus] || lastActiveTime(b) - lastActiveTime(a),
  );
}

function bucketUsersByGroup(users: PlatformPresenceUser[], groups: GroupDTO[]): { group: GroupDTO; members: PlatformPresenceUser[] }[] {
  return groups
    .map((group) => ({ group, members: sortByStatus(users.filter((user) => user.groups.includes(group.id))) }))
    .filter((bucket) => bucket.members.length > 0);
}

interface PickerSection {
  key: string;
  label: string;
  textColor?: string;
  members: PlatformPresenceUser[];
}

function buildSections(
  users: PlatformPresenceUser[],
  groups: GroupDTO[],
  recentRank: Map<string, number>,
  currentUserId: string | undefined,
  generalLabel: string,
  recentLabel: string,
): PickerSection[] {
  const candidates = users.filter((user) => user.id !== currentUserId);

  const recent = candidates
    .filter((user) => recentRank.has(user.id))
    .sort((a, b) => recentRank.get(b.id)! - recentRank.get(a.id)!);

  // Quem já está em "Recentes" não aparece de novo lá embaixo, nem no grupo
  // dele nem no Geral.
  const remaining = candidates.filter((user) => !recentRank.has(user.id));
  const groupBuckets = bucketUsersByGroup(remaining, groups);
  const groupedIds = new Set(groupBuckets.flatMap((bucket) => bucket.members.map((member) => member.id)));
  const ungrouped = sortByStatus(remaining.filter((user) => !groupedIds.has(user.id)));

  const sections: PickerSection[] = [];
  if (recent.length > 0) sections.push({ key: 'recent', label: recentLabel, members: recent });
  for (const bucket of groupBuckets) {
    sections.push({ key: bucket.group.id, label: bucket.group.title, textColor: bucket.group.textColor, members: bucket.members });
  }
  if (ungrouped.length > 0) sections.push({ key: 'general', label: generalLabel, members: ungrouped });

  return sections;
}

/** Filtra dentro de cada seção e derruba a seção que não sobra ninguém — sem isso um "Geral" vazio ficava na tela só com o rótulo. */
function filterSections(sections: PickerSection[], query: string): PickerSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => ({ ...section, members: section.members.filter((member) => member.username.toLowerCase().includes(q)) }))
    .filter((section) => section.members.length > 0);
}

const SKELETON_ROWS = 6;

function PickerRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 animate-pulse">
      <div className="size-8 shrink-0 rounded-full bg-muted/60" />
      <div className="h-3.5 w-32 rounded-md bg-muted/60" />
    </div>
  );
}

export default function StartDirectMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('dm.picker');
  const [query, setQuery] = useState('');
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { users, groups, loading } = usePlatformPresenceUsers();
  const { conversations } = useDirectConversations();
  const { data: session } = useSession();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentUserId = session?.user?.id;

  const recentRank = useMemo(() => {
    const map = new Map<string, number>();
    for (const conversation of conversations) map.set(conversation.otherParticipant.id, new Date(conversation.updatedAt).getTime());
    return map;
  }, [conversations]);

  const sections = useMemo(
    () => filterSections(buildSections(users, groups, recentRank, currentUserId, t('general'), t('recent')), query),
    [users, groups, recentRank, currentUserId, query, t],
  );

  // Lista achatada na MESMA ordem visual (seção por seção) — é sobre ela que
  // as setas navegam, atravessando o limite entre seções sem se importar com
  // rótulo nenhum.
  const flatUsers = useMemo(() => sections.flatMap((section) => section.members), [sections]);
  const flatIndexById = useMemo(() => new Map(flatUsers.map((user, index) => [user.id, index])), [flatUsers]);
  const activeIndex = Math.min(selectedIndex, Math.max(flatUsers.length - 1, 0));

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const startConversation = useCallback(
    async (userId: string) => {
      setCreatingUserId(userId);
      try {
        const response = await fetch('/api/dm/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { id: string };
        onOpenChange(false);
        setQuery('');
        // Reabre de propósito: se a conversa estava escondida da barra
        // lateral, o POST acima já zerou hiddenAt no servidor — falta só
        // puxar a lista local de novo pra ela reaparecer.
        refreshDirectConversations();
        router.push(routeNames.DM(data.id));
      } finally {
        setCreatingUserId(null);
      }
    },
    [router, onOpenChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, flatUsers.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = flatUsers[activeIndex];
        if (selected) void startConversation(selected.id);
      }
    },
    [flatUsers, activeIndex, startConversation],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent
        className="flex max-h-[min(34rem,75vh)] max-w-lg flex-col gap-3 p-4"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <SearchField
          ref={searchRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder')}
          className="shrink-0"
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <PickerRowSkeleton key={index} />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t('noResults')}</p>
          ) : (
            sections.map((section) => (
              <div key={section.key} className="mb-4 last:mb-0">
                <div
                  className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground/60"
                  style={section.textColor ? { color: section.textColor } : undefined}
                >
                  {section.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {section.members.map((user) => {
                    const index = flatIndexById.get(user.id)!;
                    return (
                      <button
                        key={user.id}
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        type="button"
                        disabled={creatingUserId === user.id}
                        onClick={() => void startConversation(user.id)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
                          index === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={8} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="min-w-0 truncate text-sm font-medium">{user.username}</span>
                          {user.discordUsername && (
                            <span className="min-w-0 truncate text-[10px] leading-tight text-muted-foreground">{user.discordUsername}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
