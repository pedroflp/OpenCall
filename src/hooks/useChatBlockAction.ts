'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { setChatBlockedLocally } from '@/hooks/usePlatformPresenceUsers';

const BLOCK_ERROR_MESSAGE: Record<string, string> = {
  CANNOT_BLOCK_ADMIN: 'Um channels_admin não pode bloquear um ADMIN.',
};

/** Toggle de bloqueio de envio no canal de texto (ver POST /api/chat/block), usado no popover de PlatformUsersSidebar. */
export function useChatBlockAction(targetUserId: string, blocked: boolean) {
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
        toast({
          title: blocked ? 'Não deu pra liberar o chat' : 'Não deu pra bloquear o chat',
          description: (data?.error && BLOCK_ERROR_MESSAGE[data.error]) || 'Tenta de novo.',
          variant: 'destructive',
        });
      } else {
        setChatBlockedLocally(targetUserId, !blocked);
      }
    } catch {
      toast({
        title: blocked ? 'Não deu pra liberar o chat' : 'Não deu pra bloquear o chat',
        description: 'Falha de rede, tenta de novo.',
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  }

  return { pending, toggle };
}
