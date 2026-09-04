'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import { getCallCooldownRemaining, setCallCooldown } from '@/lib/rtc/callCooldown';

/** Códigos que a rota devolve com frase própria em `presence.actions.callErrors`. */
const INVITE_ERRORS = ['DM_BLOCKED'] as const;

// Precisa bater com COOLDOWN_MS de src/app/api/rtc/invite/route.ts — usado só
// pra já nascer no estado certo no clique de sucesso, sem esperar a resposta
// do servidor de novo (o 429 seguinte já devolve o retryAfterMs exato).
const CALL_COOLDOWN_MS = 60_000;

export type CallStatus = 'idle' | 'sending' | 'cooldown';

/**
 * Compartilhado entre PlatformUsersSidebar (chamar um usuário da plataforma)
 * e InviteToChannelsModal (chamar qualquer ID do Discord digitado à mão) —
 * ambos batem na mesma rota /api/rtc/invite, então o estado de cooldown e o
 * tratamento de erro precisam ser idênticos.
 */
export function useCallAction(targetUserId: string) {
  const t = useTranslations('presence.actions');
  const { toast } = useToast();
  // Semeia o estado com o cooldown persistido (ver callCooldown.ts) — sem
  // isso, fechar e reabrir o popover/modal remonta esse hook do zero e o
  // botão aparece disponível mesmo com o cooldown do servidor ainda rolando.
  const [status, setStatus] = useState<CallStatus>(() =>
    getCallCooldownRemaining(targetUserId) > 0 ? 'cooldown' : 'idle'
  );
  const [remainingMs, setRemainingMs] = useState(() => getCallCooldownRemaining(targetUserId));

  // Resincroniza quando o targetUserId muda em vez de remontar (caso do
  // InviteToChannelsModal, onde o ID vem de um input controlado e o hook
  // continua o mesmo componente montado).
  useEffect(() => {
    const remaining = getCallCooldownRemaining(targetUserId);
    setStatus(remaining > 0 ? 'cooldown' : 'idle');
    setRemainingMs(remaining);
  }, [targetUserId]);

  // Contagem regressiva do cooldown, só pra manter o tooltip com o tempo
  // certo — quem decide quando liberar de fato é o servidor (próximo 429
  // sempre traz o retryAfterMs real).
  useEffect(() => {
    if (status !== 'cooldown' || remainingMs <= 0) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          setStatus('idle');
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, remainingMs]);

  async function call() {
    if (status !== 'idle' || !targetUserId) return;
    setStatus('sending');

    try {
      const response = await fetch('/api/rtc/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      if (response.ok) {
        setStatus('cooldown');
        setRemainingMs(CALL_COOLDOWN_MS);
        setCallCooldown(targetUserId, CALL_COOLDOWN_MS);
        return;
      }

      const data = (await response.json().catch(() => null)) as { error?: string; retryAfterMs?: number } | null;
      if (data?.error === 'COOLDOWN') {
        const retryAfterMs = data.retryAfterMs ?? CALL_COOLDOWN_MS;
        setStatus('cooldown');
        setRemainingMs(retryAfterMs);
        setCallCooldown(targetUserId, retryAfterMs);
        return;
      }

      setStatus('idle');
      const code = data?.error ?? '';
      toast({
        title: t('callFailed'),
        description: (INVITE_ERRORS as readonly string[]).includes(code)
          ? t(`callErrors.${code as (typeof INVITE_ERRORS)[number]}`)
          : t('tryAgainSoon'),
        variant: 'destructive',
      });
    } catch {
      setStatus('idle');
      toast({ title: t('callFailed'), description: t('networkFailed'), variant: 'destructive' });
    }
  }

  return { status, remainingMs, call };
}
