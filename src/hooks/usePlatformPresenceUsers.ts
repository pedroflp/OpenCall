'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { PlatformPresenceUser } from '@/lib/presence/platformPresence';
import type { GroupDTO } from '@/app/api/groups/types';

/** Mesmo padrão de src/hooks/useChannelPresence.ts, mas pra uma lista única (a plataforma inteira, não por canal). */
const POLL_INTERVAL_MS = 30_000;
const FRESH_WINDOW_MS = 2_000;

interface PresenceListState {
  users: PlatformPresenceUser[];
  groups: GroupDTO[];
  loading: boolean;
}

const LOADING_SNAPSHOT: PresenceListState = { users: [], groups: [], loading: true };

let snapshot: PresenceListState = LOADING_SNAPSHOT;
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function sameUsers(a: PlatformPresenceUser[], b: PlatformPresenceUser[]): boolean {
  return (
    a.length === b.length &&
    a.every((user, index) => {
      const other = b[index];
      return (
        user.id === other.id &&
        user.username === other.username &&
        user.avatar === other.avatar &&
        user.activeStatus === other.activeStatus &&
        user.groups.join(',') === other.groups.join(',') &&
        user.lastActiveAt === other.lastActiveAt &&
        user.chatBlocked === other.chatBlocked &&
        user.voiceChannelId === other.voiceChannelId
      );
    })
  );
}

function sameGroups(a: GroupDTO[], b: GroupDTO[]): boolean {
  return (
    a.length === b.length &&
    a.every((group, index) => {
      const other = b[index];
      return (
        group.id === other.id &&
        group.title === other.title &&
        group.textColor === other.textColor &&
        group.sortIndex === other.sortIndex
      );
    })
  );
}

function scheduleNextPoll() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (listeners.size === 0) return;

  timer = setTimeout(() => {
    timer = null;
    if (listeners.size === 0) return;
    if (document.hidden) {
      scheduleNextPoll();
      return;
    }
    void fetchUsers();
  }, POLL_INTERVAL_MS);
}

function fetchUsers(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch('/api/presence/users');
      if (!response.ok) return;
      const { users, groups } = (await response.json()) as { users: PlatformPresenceUser[]; groups: GroupDTO[] };
      if (snapshot.loading || !sameUsers(snapshot.users, users) || !sameGroups(snapshot.groups, groups)) {
        snapshot = { users, groups, loading: false };
      }
    } catch {
      // rede caiu: mantém o último snapshot e tenta de novo no próximo tick
    } finally {
      fetchedAt = Date.now();
      inFlight = null;
      listeners.forEach((notify) => notify());
      scheduleNextPoll();
    }
  })();

  return inFlight;
}

function refetchIfStale() {
  if (Date.now() - fetchedAt > FRESH_WINDOW_MS) void fetchUsers();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  refetchIfStale();
  scheduleNextPoll();

  return () => {
    listeners.delete(notify);
    if (listeners.size > 0 || !timer) return;
    clearTimeout(timer);
    timer = null;
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || listeners.size === 0) return;
    refetchIfStale();
  });
}

/** Atualização otimista pós-mutação (ex: block/unblock no chat) — evita esperar o próximo poll de 20s pra refletir na sidebar. */
export function setChatBlockedLocally(userId: string, blocked: boolean) {
  const index = snapshot.users.findIndex((user) => user.id === userId);
  if (index === -1 || snapshot.users[index].chatBlocked === blocked) return;

  const users = snapshot.users.slice();
  users[index] = { ...users[index], chatBlocked: blocked };
  snapshot = { ...snapshot, users };
  listeners.forEach((notify) => notify());
}

function getSnapshot(): PresenceListState {
  return snapshot;
}

function getServerSnapshot(): PresenceListState {
  return LOADING_SNAPSHOT;
}

export function usePlatformPresenceUsers(): PresenceListState {
  const subscribeStore = useCallback((notify: () => void) => subscribe(notify), []);
  return useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot);
}
