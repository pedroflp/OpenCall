'use client';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('admin.channels.delete');
  const tAdmin = useTranslations('admin');
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
      toast({ title: t('failed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
      return;
    }

    toast({ title: t('done') });
    handleOpenChange(false);
    onDeleted(channel.id);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>

        <div className="space-y-4">
          {/* Nome e contagem entram como TAGS do ICU: os dois vêm em negrito
              no meio da frase, e o "e N mensagens" some quando o canal está
              vazio — um `plural` resolve isso sem três concatenações aqui. */}
          <p className="text-sm text-muted-foreground">
            {t.rich('body', {
              name: (chunks) => <span className="font-semibold text-foreground">&quot;{chunks}&quot;</span>,
              count: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              channelName: channel.name,
              messages: channel.messageCount ?? 0,
            })}
            {isVoice && ` ${t('voiceNote')}`}
          </p>

          <div className="space-y-2">
            <Label>
              {t.rich('confirmLabel', {
                name: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
                channelName: channel.name,
              })}
            </Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="destructive" onClick={handleDelete} disabled={!matches || pending}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
