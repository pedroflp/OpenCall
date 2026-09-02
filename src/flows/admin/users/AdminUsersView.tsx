'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import { UserRoles } from '@/app/api/user/types';

/** Otimista: sem isso o Switch só reflete o clique depois de dois round-trips (o PATCH em si, e o router.refresh() que o segue). */
function useRoleToggle(endpoint: string, serverChecked: boolean, onChanged: () => void) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [serverChecked]);
  const checked = optimistic ?? serverChecked;

  async function toggle(enabled: boolean) {
    setOptimistic(enabled);
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: enabled ? 'POST' : 'DELETE' });
      if (!response.ok) throw new Error();
      onChanged();
    } catch {
      setOptimistic(null);
      toast({ title: 'Não deu pra atualizar', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  return { checked, pending, toggle };
}

function PermissionsRow({
  user,
  isSelf,
  currentUserIsAdmin,
  onChanged,
}: {
  user: AdminUserDTO;
  isSelf: boolean;
  currentUserIsAdmin: boolean;
  onChanged: () => void;
}) {
  const targetIsAdmin = user.roles.includes(UserRoles.ADMIN);
  // Literal, não OR'd com ADMIN: ADMIN + CHANNELS_ACCESS juntos formam o combo
  // "superadmin" — precisa dar pra ver quem tem os dois de fato.
  const roleIsChannelsAccess = user.roles.includes(UserRoles.CHANNELS_ACCESS);
  const roleHasCanalAccess = targetIsAdmin || user.roles.includes(UserRoles.CANAL_ACCESS);

  const channelsAccess = useRoleToggle(`/api/admin/users/${user.id}/channels-admin-role`, roleIsChannelsAccess, onChanged);
  const canalAccess = useRoleToggle(`/api/admin/users/${user.id}/canal-access`, roleHasCanalAccess, onChanged);

  // Regra: um CHANNELS_ACCESS comum não pode DESATIVAR o CHANNELS_ACCESS de
  // alguém que é ADMIN (só ativar, formando o combo "superadmin" — nunca
  // remover). Só quem já é ADMIN pode desligar isso de outro ADMIN.
  const channelsAccessBlocked = targetIsAdmin && !currentUserIsAdmin && channelsAccess.checked;
  const channelsAccessTooltip = isSelf
    ? 'Você não pode alterar isso pra você mesmo por aqui'
    : channelsAccessBlocked
      ? 'Só um admin pode remover admin de canais de outro admin'
      : null;

  // Acesso à voz continua ADMIN-only (rota /canal-access não muda) — quem
  // só tem CHANNELS_ACCESS vê a coluna, mas não consegue mexer nela.
  const canalAccessTooltip = targetIsAdmin
    ? 'Admin sempre tem acesso ao OpenCall'
    : !currentUserIsAdmin
      ? 'Só um admin pode alterar o acesso ao OpenCall'
      : null;

  const channelsAccessControl = (
    <Switch
      checked={channelsAccess.checked}
      disabled={isSelf || channelsAccess.pending || channelsAccessBlocked}
      onCheckedChange={channelsAccess.toggle}
      aria-label={
        channelsAccess.checked ? `Remover admin de canais de ${user.username}` : `Tornar ${user.username} admin de canais`
      }
    />
  );

  const canalAccessControl = (
    <Switch
      checked={canalAccess.checked}
      disabled={targetIsAdmin || !currentUserIsAdmin || canalAccess.pending}
      onCheckedChange={canalAccess.toggle}
      aria-label={
        canalAccess.checked ? `Remover acesso ao OpenCall de ${user.username}` : `Dar acesso ao OpenCall para ${user.username}`
      }
    />
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={8} />
          <span className="truncate text-sm font-medium">{user.username}</span>
          {targetIsAdmin && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Admin</span>
          )}
        </div>
      </TableCell>

      <TableCell>
        {channelsAccessTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit">{channelsAccessControl}</div>
            </TooltipTrigger>
            <TooltipContent>{channelsAccessTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          channelsAccessControl
        )}
      </TableCell>

      <TableCell>
        {canalAccessTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit">{canalAccessControl}</div>
            </TooltipTrigger>
            <TooltipContent>{canalAccessTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          canalAccessControl
        )}
      </TableCell>
    </TableRow>
  );
}

export default function AdminUsersView({
  users,
  currentUserId,
  currentUserIsAdmin,
}: {
  users: AdminUserDTO[];
  currentUserId?: string;
  currentUserIsAdmin: boolean;
}) {
  const router = useRouter();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Admin de canais gerencia quem tem acesso ao OpenCall; combinado com admin da plataforma, forma um superadmin.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Admin de canais</TableHead>
            <TableHead>Acesso ao OpenCall</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <PermissionsRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              currentUserIsAdmin={currentUserIsAdmin}
              onChanged={() => router.refresh()}
            />
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
