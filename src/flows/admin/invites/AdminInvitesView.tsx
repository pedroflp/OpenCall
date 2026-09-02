'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import { useToast } from '@/components/ui/use-toast';
import type { AdminInviteDTO } from '@/app/api/admin/invites/types';
import { createInvite, revokeInvite } from '@/app/api/admin/invites/requests';
import { cn } from '@/lib/utils';

function InviteRow({ invite, onRevoked }: { invite: AdminInviteDTO; onRevoked: (id: string) => void }) {
  const { toast } = useToast();
  const [revoking, setRevoking] = useState(false);
  const revoked = Boolean(invite.revokedAt);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.code);
      toast({ title: 'Código copiado!' });
    } catch {
      toast({ title: 'Não deu pra copiar', description: 'Copie manualmente.', variant: 'destructive' });
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    const result = await revokeInvite(invite.id);
    setRevoking(false);

    if (!result.ok) {
      toast({ title: 'Não deu pra revogar', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
      return;
    }
    onRevoked(invite.id);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <HugeIcon name="ticket-01" size={18} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className={cn('font-mono font-semibold tracking-widest', revoked && 'text-muted-foreground line-through')}>{invite.code}</p>
          <p className="text-xs text-muted-foreground">
            {invite.redeemedCount === 1 ? '1 pessoa entrou com esse código' : `${invite.redeemedCount} pessoas entraram com esse código`}
            {revoked && ' · revogado'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Copiar código" onClick={() => void copy()}>
          <HugeIcon name="copy-01" size={16} />
        </Button>
        {!revoked && (
          <Button variant="ghost" size="icon" aria-label="Revogar código" disabled={revoking} onClick={() => void handleRevoke()}>
            <HugeIcon name="delete-02" size={16} className="text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminInvitesView({ invites: initialInvites }: { invites: AdminInviteDTO[] }) {
  const { toast } = useToast();
  const [invites, setInvites] = useState(initialInvites);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    const result = await createInvite();
    setCreating(false);

    const invite = result.data?.invite as AdminInviteDTO | undefined;
    if (!result.ok || !invite) {
      toast({ title: 'Não deu pra criar o código', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
      return;
    }
    setInvites((prev) => [invite, ...prev]);
  }

  function handleRevoked(id: string) {
    setInvites((prev) => prev.map((invite) => (invite.id === id ? { ...invite, revokedAt: new Date().toISOString() } : invite)));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Convites</h1>
          <p className="text-sm text-muted-foreground">Códigos multi-uso e sem expiração — quem cola um ganha acesso aos canais.</p>
        </div>

        <Button className="gap-2" disabled={creating} onClick={() => void handleCreate()}>
          <HugeIcon name="add-01" size={16} />
          Novo código
        </Button>
      </div>

      {invites.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Nenhum código criado ainda.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} onRevoked={handleRevoked} />
        ))}
      </div>
    </main>
  );
}
