'use client';

import { useTranslations } from 'next-intl';
import type { UserDTO } from '@/app/api/user/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HugeIcon } from '@/components/HugeIcon';
import { useToast } from '@/components/ui/use-toast';
import { routeNames } from '@/app/route.names';

// Rota pública própria (routeNames.INVITE) em vez de linkar /channels direto —
// assim o link colado em qualquer lugar gera uma prévia rica com o nome e a
// foto de quem convidou (o /channels em si é gated e não teria isso).
function inviteUrl(user: UserDTO | null): string {
  if (typeof window === 'undefined') return routeNames.INVITE;

  const url = new URL(routeNames.INVITE, window.location.origin);
  if (user?.username) url.searchParams.set('name', user.username);
  if (user?.avatar) url.searchParams.set('avatar', user.avatar);
  return url.toString();
}

export default function InviteToChannelsModal({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDTO | null;
}) {
  const t = useTranslations('voice.invite');
  const { toast } = useToast();

  async function copy(text: string, successTitle: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: successTitle });
    } catch {
      toast({ title: t('copyFailed'), description: t('copyFailedDescription'), variant: 'destructive' });
    }
  }

  const url = inviteUrl(user);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <Button type="button" variant="outline" className="gap-1" onClick={() => void copy(url, t('linkCopied'))}>
          <HugeIcon name="copy-link" size={16} />
          {t('copyLink')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
