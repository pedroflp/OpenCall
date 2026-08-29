'use client';

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
      toast({ title: 'Não deu pra salvar o grupo', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
      return;
    }

    const savedGroup: GroupDTO = result.data?.group ?? { ...group!, ...input };

    toast({ title: isEditing ? 'Grupo atualizado!' : 'Grupo criado!' });
    setOpen(false);
    resetIfCreating();
    onSaved(savedGroup);
  }

  const invalid = !title.trim() || !textColor.trim() || !Number.isFinite(Number(sortIndex));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEditing ? 'Editar grupo' : 'Novo grupo'}</DialogTitle>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Staff" maxLength={40} />
          </div>

          <div className="space-y-2">
            <Label>Cor do nome dos membros</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                aria-label="Cor do grupo"
              />
              <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} placeholder="#a855f7" maxLength={20} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prioridade de ordenação</Label>
            <Input
              type="number"
              value={sortIndex}
              onChange={(e) => setSortIndex(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Quanto menor o número, mais acima o grupo aparece.</p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={invalid || submitting}>
            {isEditing ? 'Salvar alterações' : 'Criar grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
