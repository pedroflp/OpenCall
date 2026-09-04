'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import { setChatBlockedLocally } from '@/hooks/usePlatformPresenceUsers';

/** Códigos que a rota devolve com frase própria em `presence.actions.blockErrors`. */
const BLOCK_ERRORS = ['CANNOT_BLOCK_ADMIN'] as const;

/** Toggle de bloqueio de envio no canal de texto (ver POST /api/chat/block), usado no popover de PlatformUsersSidebar. */
export function useChatBlockAction(targetUserId: string, blocked: boolean) {
  const t = useTranslations('presence.actions');
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);

    try {
      const response = await fetch('/api/chat/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, blocked: !blocked }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        const code = data?.error ?? '';
        toast({
          title: blocked ? t('unblockFailed') : t('blockFailed'),
          description: (BLOCK_ERRORS as readonly string[]).includes(code)
            ? t(`blockErrors.${code as (typeof BLOCK_ERRORS)[number]}`)
            : t('tryAgain'),
          variant: 'destructive',
        });
      } else {
        setChatBlockedLocally(targetUserId, !blocked);
      }
    } catch {
      toast({
        title: blocked ? t('unblockFailed') : t('blockFailed'),
        description: t('networkFailed'),
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  }

  return { pending, toggle };
}
