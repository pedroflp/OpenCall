'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { useAdminRefresh } from '@/flows/admin/refresh';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import type { GroupDTO } from '@/app/api/groups/types';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import GroupFormDialog from './GroupFormDialog';
import GroupCard from './GroupCard';

function sortGroups(groups: GroupDTO[]) {
  return [...groups].sort((a, b) => a.sortIndex - b.sortIndex);
}

export default function AdminGroupsView({ groups: initialGroups, users: initialUsers }: { groups: GroupDTO[]; users: AdminUserDTO[] }) {
  const t = useTranslations('admin.groups');
  const refresh = useAdminRefresh();
  // Estado local otimista: a UI reflete a mudança na hora, sem esperar o
  // round-trip completo do refresh (que refaz auth + 3 queries em
  // paralelo). O refresh ainda roda em background só pra manter os props do
  // Server Component em dia; os efeitos abaixo resincronizam quando ele chega.
  const [groups, setGroups] = useState(() => sortGroups(initialGroups));
  const [users, setUsers] = useState(initialUsers);

  useEffect(() => setGroups(sortGroups(initialGroups)), [initialGroups]);
  useEffect(() => setUsers(initialUsers), [initialUsers]);

  function handleGroupCreated(group: GroupDTO) {
    setGroups((prev) => sortGroups([...prev, group]));
    refresh();
  }

  function handleGroupUpdated(group: GroupDTO) {
    setGroups((prev) => sortGroups(prev.map((g) => (g.id === group.id ? group : g))));
    refresh();
  }

  function handleGroupDeleted(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    refresh();
  }

  function handleMembersAdded(groupId: string, userIds: string[]) {
    setUsers((prev) =>
      prev.map((user) => (userIds.includes(user.id) && !user.groups.includes(groupId) ? { ...user, groups: [...user.groups, groupId] } : user)),
    );
    refresh();
  }

  function handleMemberRemoved(groupId: string, userId: string) {
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, groups: user.groups.filter((id) => id !== groupId) } : user)));
    refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <GroupFormDialog
          onSaved={handleGroupCreated}
          trigger={
            <Button className="gap-2">
              <HugeIcon name="add-01" size={16} />
              {t('newGroup')}
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {groups.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        )}

        {groups.map((group) => {
          const members = users.filter((user) => user.groups.includes(group.id));
          const availableUsers = users.filter((user) => !user.groups.includes(group.id));

          return (
            <GroupCard
              key={group.id}
              group={group}
              members={members}
              availableUsers={availableUsers}
              onGroupUpdated={handleGroupUpdated}
              onGroupDeleted={handleGroupDeleted}
              onMembersAdded={handleMembersAdded}
              onMemberRemoved={handleMemberRemoved}
            />
          );
        })}
      </div>
    </main>
  );
}
