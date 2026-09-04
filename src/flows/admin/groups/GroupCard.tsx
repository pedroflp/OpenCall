'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import type { GroupDTO } from '@/app/api/groups/types';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import { addGroupMembers, removeGroupMember, deleteGroup } from '@/app/api/admin/groups/requests';
import GroupFormDialog from './GroupFormDialog';

export default function GroupCard({
  group,
  members,
  availableUsers,
  onGroupUpdated,
  onGroupDeleted,
  onMembersAdded,
  onMemberRemoved,
}: {
  group: GroupDTO;
  members: AdminUserDTO[];
  availableUsers: AdminUserDTO[];
  onGroupUpdated: (group: GroupDTO) => void;
  onGroupDeleted: (groupId: string) => void;
  onMembersAdded: (groupId: string, userIds: string[]) => void;
  onMemberRemoved: (groupId: string, userId: string) => void;
}) {
  const t = useTranslations('admin.groups');
  const tAdmin = useTranslations('admin');
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);

  function toggleSelected(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleAddSelectedMembers() {
    if (selectedIds.length === 0) return;
    setAddingMembers(true);
    const result = await addGroupMembers(group.id, selectedIds);
    setAddingMembers(false);
    if (!result.ok) {
      toast({ title: t('addFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
      return;
    }
    onMembersAdded(group.id, selectedIds);
    setSelectedIds([]);
    setAddOpen(false);
  }

  async function handleRemoveMember(userId: string) {
    setPending(userId);
    const result = await removeGroupMember(group.id, userId);
    setPending(null);
    if (!result.ok) {
      toast({ title: t('removeFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
      return;
    }
    onMemberRemoved(group.id, userId);
  }

  async function handleDeleteGroup() {
    if (!window.confirm(`Apagar o grupo "${group.title}"? Isso remove todo mundo dele.`)) return;
    setPending('__delete__');
    const result = await deleteGroup(group.id);
    setPending(null);
    if (!result.ok) {
      toast({ title: t('deleteFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
      return;
    }
    toast({ title: t('deleted') });
    onGroupDeleted(group.id);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: group.textColor }} />
          <div>
            <h3 className="font-semibold" style={{ color: group.textColor }}>{group.title}</h3>
            <p className="text-xs text-muted-foreground">
              Prioridade {group.sortIndex} · {members.length} membro{members.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <GroupFormDialog
            group={group}
            onSaved={onGroupUpdated}
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('editGroup')}>
                <HugeIcon name="pencil-edit-01" size={16} />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('deleteGroup')}
            onClick={handleDeleteGroup}
            disabled={pending === '__delete__'}
          >
            <HugeIcon name="delete-01" size={16} className="text-destructive" />
          </Button>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {members.map((user) => (
          <li key={user.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
            <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={7} />
            <span className="flex-1 truncate text-sm font-medium" style={{ color: group.textColor }}>
              {user.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t('removeFromGroup')}
              onClick={() => handleRemoveMember(user.id)}
              disabled={pending === user.id}
            >
              <HugeIcon name="cancel-01" size={14} />
            </Button>
          </li>
        ))}
        {members.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('noMembers')}</p>}
      </ul>

      {availableUsers.length > 0 && (
        <div className="mt-3">
          <Popover
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) setSelectedIds([]);
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 w-full justify-start gap-2 font-normal">
                <HugeIcon name="add-01" size={14} />
                {selectedIds.length > 0 ? t('selectedCount', { count: selectedIds.length }) : t('addMember')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {availableUsers.map((user) => {
                  const checked = selectedIds.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(user.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-primary"
                      />
                      <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={5} />
                      <span className="flex-1 truncate">{user.username}</span>
                    </label>
                  );
                })}
              </div>
              <Button className="mt-2 w-full" size="sm" onClick={handleAddSelectedMembers} disabled={selectedIds.length === 0 || addingMembers}>
                {addingMembers ? t('adding') : t('addSelected', { count: selectedIds.length })}
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
