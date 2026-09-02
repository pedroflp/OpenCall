'use client';

import { useState, type ReactNode } from 'react';
import { ChannelType } from '@prisma/client';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';
import { deleteChannel } from '@/app/api/admin/channels/requests';

/**
 * Hard-delete de verdade (ver ADR-0003 revisada) — sem volta, então exige
 * double confirm: o admin precisa digitar o nome exato do canal pra habilitar
 * o botão, além do próprio ato de abrir o diálogo e confirmar.
 */
export default function DeleteChannelDialog({
  channel,
  trigger,
  onDeleted,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  channel: Pick<AdminChannelDTO, 'id' | 'type' | 'name'> & { messageCount?: number };
  trigger?: ReactNode;
  onDeleted: (channelId: string) => void;
  // Sem trigger próprio (ex.: aberto por um item de menu de fora, ver
  // ChannelContextMenu na sidebar) — quem chama controla o open direto,
  // em vez do estado interno de sempre.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpenState = controlledOnOpenChange ?? setUncontrolledOpen;
  const [confirmText, setConfirmText] = useState('');
  const [pending, setPending] = useState(false);

  const isVoice = channel.type === ChannelType.VOICE;
  const matches = confirmText.trim() === channel.name;

  function handleOpenChange(next: boolean) {
    setOpenState(next);
    if (!next) setConfirmText('');
  }

  async function handleDelete() {
    if (!matches) return;
    setPending(true);
    const result = await deleteChannel(channel.id);
    setPending(false);

    if (!result.ok) {
      toast({ title: 'Não deu pra excluir o canal', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Canal excluído permanentemente.' });
    handleOpenChange(false);
    onDeleted(channel.id);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogTitle>Excluir canal permanentemente</DialogTitle>
        <DialogDescription>Essa ação não pode ser desfeita.</DialogDescription>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Isso vai apagar o canal <span className="font-semibold text-foreground">&quot;{channel.name}&quot;</span>
            {(channel.messageCount ?? 0) > 0 && (
              <>
                {' '}
                e <span className="font-semibold text-foreground">{channel.messageCount}</span>{' '}
                {channel.messageCount === 1 ? 'mensagem' : 'mensagens'}
              </>
            )}
            {' '}permanentemente.
            {isVoice && ' Quem já estiver conectado na sala não é desconectado, mas ninguém mais vai conseguir entrar.'}
          </p>

          <div className="space-y-2">
            <Label>
              Digite <span className="font-semibold text-foreground">{channel.name}</span> pra confirmar
            </Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="destructive" onClick={handleDelete} disabled={!matches || pending}>
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
