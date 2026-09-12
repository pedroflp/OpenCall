'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { useAdminRefresh } from '@/flows/admin/refresh';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import type { AdminUserDTO } from '@/app/api/admin/users/types';
import { UserRoles } from '@/app/api/user/types';

/** Otimista: sem isso o Switch só reflete o clique depois de dois round-trips (o PATCH em si, e o refresh que o segue). */
function useRoleToggle(endpoint: string, serverChecked: boolean, onChanged: () => void) {
  const t = useTranslations('admin.users');
  const tAdmin = useTranslations('admin');
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
      toast({ title: t('updateFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  return { checked, pending, toggle };
}

/**
 * Diferente do toggle de OpenCall access (só flipa CANAL_ACCESS — qualquer
 * convite novo devolve o acesso), banir marca `bannedAt` no usuário, o que
 * POST /api/invite/redeem passa a recusar: de verdade tira a pessoa do
 * OpenCall, não só desliga o acesso atual. Também derruba a call ativa dela
 * (ver POST /api/admin/users/[userId]/ban). Reversível — desbanir só solta o
 * bloqueio de resgate, não devolve o role sozinho — mas exige confirmação por
 * ser destrutivo o bastante pra merecer o passo a mais.
 */
function BanUserAction({ user, disabled, onChanged }: { user: AdminUserDTO; disabled: boolean; onChanged: () => void }) {
  const t = useTranslations('admin.users.ban');
  const tAdmin = useTranslations('admin');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const banned = Boolean(user.bannedAt);

  async function handleUnban() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/ban`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      onChanged();
    } catch {
      toast({ title: t('unbanFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  async function handleBan() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/ban`, { method: 'POST' });
      if (!response.ok) throw new Error();
      setOpen(false);
      onChanged();
    } catch {
      toast({ title: t('banFailed'), description: tAdmin('tryAgainSoon'), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  if (banned) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">{t('bannedBadge')}</Badge>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleUnban()} loading={pending}>
          {t('unban')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {t('ban')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>
            {t.rich('confirmDescription', {
              name: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              username: user.username,
            })}
          </DialogDescription>
          <DialogFooter>
            <Button type="button" variant="destructive" onClick={() => void handleBan()} loading={pending}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
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
  const t = useTranslations('admin.users');
  const tAdmin = useTranslations('admin');
  const tBan = useTranslations('admin.users.ban');
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
    ? t('selfTooltip')
    : channelsAccessBlocked
      ? t('adminOnlyChannelsTooltip')
      : null;

  // Acesso à voz continua ADMIN-only (rota /canal-access não muda) — quem
  // só tem CHANNELS_ACCESS vê a coluna, mas não consegue mexer nela.
  const canalAccessTooltip = targetIsAdmin
    ? t('adminAlwaysHasAccess')
    : !currentUserIsAdmin
      ? t('adminOnlyAccessTooltip')
      : null;

  const channelsAccessControl = (
    <Switch
      checked={channelsAccess.checked}
      disabled={isSelf || channelsAccess.pending || channelsAccessBlocked}
      onCheckedChange={channelsAccess.toggle}
      aria-label={
        channelsAccess.checked
          ? t('removeChannelsAdmin', { username: user.username })
          : t('grantChannelsAdmin', { username: user.username })
      }
    />
  );

  const canalAccessControl = (
    <Switch
      checked={canalAccess.checked}
      disabled={targetIsAdmin || !currentUserIsAdmin || canalAccess.pending}
      onCheckedChange={canalAccess.toggle}
      aria-label={
        canalAccess.checked
          ? t('revokeAccess', { username: user.username })
          : t('grantAccess', { username: user.username })
      }
    />
  );

  // Mesmo gate da rota (isCurrentUserAdmin — CHANNELS_ACCESS puro não bane
  // ninguém) + as duas mesmas exceções do /api/rtc/kick: não em si mesmo, não
  // em outro ADMIN.
  const banDisabled = isSelf || targetIsAdmin || !currentUserIsAdmin;
  const banTooltip = user.bannedAt
    ? null
    : isSelf
      ? t('selfTooltip')
      : targetIsAdmin
        ? tBan('adminTooltip')
        : !currentUserIsAdmin
          ? t('adminOnlyAccessTooltip')
          : null;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={8} />
          <span className="truncate text-sm font-medium">{user.username}</span>
          {targetIsAdmin && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminBadge')}</span>
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

      <TableCell>
        {banTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit">
                <BanUserAction user={user} disabled={banDisabled} onChanged={onChanged} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{banTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <BanUserAction user={user} disabled={banDisabled} onChanged={onChanged} />
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
  const t = useTranslations('admin.users');
  const refresh = useAdminRefresh();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnUser')}</TableHead>
            <TableHead>{t('columnChannelsAdmin')}</TableHead>
            <TableHead>{t('columnAccess')}</TableHead>
            <TableHead>{t('columnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <PermissionsRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              currentUserIsAdmin={currentUserIsAdmin}
              onChanged={() => refresh()}
            />
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
