'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useCall } from '@/providers/CallProvider';
import { useVoice } from '@/providers/VoiceProvider';
import { getCallCooldownOutcome, getCallCooldownRemaining, setCallCooldown } from '@/lib/rtc/callCooldown';

const RING_ERROR_MESSAGE: Record<string, string> = {
  TARGET_OFFLINE: 'Essa pessoa não está online.',
  CHANNEL_NOT_FOUND: 'Canal inválido.',
};

export type RingStatus = 'idle' | 'no-channel' | 'already-in-room' | 'ringing' | 'cooldown' | 'rejected';

/**
 * "Ligar para entrar" — ringa alguém pra entrar no canal em que EU já estou
 * (por isso `no-channel` quando ainda não entrei em nenhum, e
 * `already-in-room` quando o alvo já está nesse mesmo canal). Namespace
 * próprio no cooldown compartilhado (`ring:`) pra não colidir com o de
 * useCallAction (chamada via DM do Discord), que é uma ação independente.
 */
export function useRingAction(targetUserId: string, targetVoiceChannelId?: string) {
  const { toast } = useToast();
  const { channel } = useVoice();
  const { outgoingCallTargetId, startRingCall } = useCall();

  const cooldownKey = `ring:${targetUserId}`;
  const isRinging = outgoingCallTargetId === targetUserId;
  const [remainingMs, setRemainingMs] = useState(() => getCallCooldownRemaining(cooldownKey));
  const [rejected, setRejected] = useState(() => getCallCooldownOutcome(cooldownKey) === 'rejected');

  // Ressincroniza com o cooldown persistido quando o alvo muda ou quando a
  // ligação que eu tinha em andamento termina (CallProvider já grava o
  // cooldown e o outcome no módulo compartilhado antes de zerar outgoingCallTargetId).
  useEffect(() => {
    if (isRinging) return;
    setRemainingMs(getCallCooldownRemaining(cooldownKey));
    setRejected(getCallCooldownOutcome(cooldownKey) === 'rejected');
  }, [cooldownKey, isRinging]);

  useEffect(() => {
    if (remainingMs <= 0) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => (prev <= 1000 ? 0 : prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingMs]);

  const status: RingStatus = !channel
    ? 'no-channel'
    : channel.id === targetVoiceChannelId
      ? 'already-in-room'
      : isRinging
        ? 'ringing'
        : remainingMs > 0
          ? (rejected ? 'rejected' : 'cooldown')
          : 'idle';

  async function ring() {
    if (status !== 'idle' || !channel) return;

    const result = await startRingCall(targetUserId, channel.id);
    if (result.ok) return;

    if (result.error === 'COOLDOWN' && result.retryAfterMs) {
      setRemainingMs(result.retryAfterMs);
      setRejected(false);
      setCallCooldown(cooldownKey, result.retryAfterMs);
      return;
    }

    toast({
      title: 'Não deu pra ligar',
      description: (result.error && RING_ERROR_MESSAGE[result.error]) || 'Tenta de novo daqui a pouco.',
      variant: 'destructive',
    });
  }

  return { status, remainingMs, ring };
}
