'use client';
import { useTranslations } from 'next-intl';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { GroupDTO } from '@/app/api/groups/types';
import { createGroup, updateGroup } from '@/app/api/admin/groups/requests';

const DEFAULT_COLOR = '#a855f7';

export default function GroupFormDialog({
  group,
  trigger,
  onSaved,
}: {
  group?: GroupDTO;
  trigger: ReactNode;
  onSaved: (group: GroupDTO) => void;
}) {
  const t = useTranslations('admin.groups.form');
  const tAdmin = useTranslations('admin');
  const { toast } = useToast();
  const isEditing = Boolean(group);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(group?.title ?? '');
  const [textColor, setTextColor] = useState(group?.textColor ?? DEFAULT_COLOR);
  const [sortIndex, setSortIndex] = useState(String(group?.sortIndex ?? 0));
  const [submitting, setSubmitting] = useState(false);

  function resetIfCreating() {
    if (isEditing) return;
    setTitle('');
    setTextColor(DEFAULT_COLOR);
    setSortIndex('0');
  }

  async function handleSubmit() {
    const parsedSortIndex = Number(sortIndex);
    if (!title.trim() || !textColor.trim() || !Number.isFinite(parsedSortIndex)) return;

    setSubmitting(true);
    const input = { title: title.trim(), textColor: textColor.trim(), sortIndex: parsedSortIndex };
    const result = isEditing ? await updateGroup(group!.id, input) : await createGroup(input);
    setSubmitting(false);

    if (!result.ok) {
      toast({ title: t('saveFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
      return;
    }

    const savedGroup: GroupDTO = result.data?.group ?? { ...group!, ...input };

    toast({ title: isEditing ? t('updated') : t('created') });
    setOpen(false);
    resetIfCreating();
    onSaved(savedGroup);
  }

  const invalid = !title.trim() || !textColor.trim() || !Number.isFinite(Number(sortIndex));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEditing ? t('editTitle') : t('createTitle')}</DialogTitle>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('titleLabel')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} maxLength={40} />
          </div>

          <div className="space-y-2">
            <Label>{t('colorLabel')}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                aria-label={t('colorPicker')}
              />
              <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} placeholder="#a855f7" maxLength={20} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('sortLabel')}</Label>
            <Input
              type="number"
              value={sortIndex}
              onChange={(e) => setSortIndex(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">{t('sortHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={invalid || submitting}>
            {isEditing ? t('saveChanges') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
