'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/use-toast';
import { useVoice } from './VoiceProvider';
import { playCallSound, stopCallSound } from '@/lib/sound';
import { setCallCooldown } from '@/lib/rtc/callCooldown';
import CallModal from '@/components/CallModal';

// Precisa bater com RING_TIMEOUT_MS/CALL_COOLDOWN_MS de
// src/lib/rtc/callSignal.ts — usados aqui só como fallback local (o servidor
// é quem de fato expira a ligação e concede o cooldown via evento 'ended').
const RING_TIMEOUT_MS = 20_000;
const CALL_COOLDOWN_MS = 60_000;

interface IncomingCall {
  callId: string;
  from: { id: string; username: string; avatar: string };
  channelId: string;
  channelName: string;
}

type CallEvent =
  | { type: 'incoming'; callId: string; from: { id: string; username: string; avatar: string }; channelId: string; channelName: string }
  | { type: 'ended'; callId: string; outcome: 'accepted' | 'rejected' | 'timeout' };

interface StartCallResult {
  ok: boolean;
  error?: string;
  retryAfterMs?: number;
}

interface CallContextValue {
  incomingCall: IncomingCall | null;
  respondToIncomingCall: (accept: boolean) => Promise<void>;
  /** targetUserId de quem está tocando agora, se algum — usado pra mostrar "Chamando..." no botão certo. */
  outgoingCallTargetId: string | null;
  startRingCall: (targetUserId: string, channelId: string) => Promise<StartCallResult>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall precisa estar dentro de CallProvider');
  return ctx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession();
  const { join } = useVoice();
  const { toast } = useToast();

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ targetUserId: string; callId: string } | null>(null);
  const incomingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIncoming = useCallback(() => {
    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
    setIncomingCall(null);
    stopCallSound();
  }, []);

  const clearOutgoing = useCallback((targetUserId: string) => {
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    setOutgoingCall(null);
    setCallCooldown(`ring:${targetUserId}`, CALL_COOLDOWN_MS);
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;

    const source = new EventSource('/api/rtc/call/events');

    source.onmessage = (event) => {
      if (!event.data) return;
      let payload: CallEvent;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === 'incoming') {
        if (incomingTimeoutRef.current) clearTimeout(incomingTimeoutRef.current);
        setIncomingCall({ callId: payload.callId, from: payload.from, channelId: payload.channelId, channelName: payload.channelName });
        incomingTimeoutRef.current = setTimeout(clearIncoming, RING_TIMEOUT_MS);
        playCallSound();
        return;
      }

      // 'ended': pode ser o fim da ligação que EU recebi (outro tab respondeu, ou expirou)
      // ou da que EU iniciei (a pessoa aceitou/recusou, ou expirou) — nunca as duas ao mesmo tempo.
      setIncomingCall((prev) => {
        if (prev?.callId !== payload.callId) return prev;
        if (incomingTimeoutRef.current) {
          clearTimeout(incomingTimeoutRef.current);
          incomingTimeoutRef.current = null;
        }
        stopCallSound();
        return null;
      });

      setOutgoingCall((prev) => {
        if (!prev || prev.callId !== payload.callId) return prev;
        if (outgoingTimeoutRef.current) {
          clearTimeout(outgoingTimeoutRef.current);
          outgoingTimeoutRef.current = null;
        }
        setCallCooldown(`ring:${prev.targetUserId}`, CALL_COOLDOWN_MS, payload.outcome === 'rejected' ? 'rejected' : undefined);
        return null;
      });
    };

    return () => {
      source.close();
      if (incomingTimeoutRef.current) clearTimeout(incomingTimeoutRef.current);
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
    };
  }, [sessionStatus, clearIncoming, toast]);

  const startRingCall = useCallback(
    async (targetUserId: string, channelId: string): Promise<StartCallResult> => {
      try {
        const response = await fetch('/api/rtc/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId, channelId }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string; retryAfterMs?: number } | null;
          return { ok: false, error: data?.error, retryAfterMs: data?.retryAfterMs };
        }

        const data = (await response.json()) as { callId: string };
        if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
        setOutgoingCall({ targetUserId, callId: data.callId });
        outgoingTimeoutRef.current = setTimeout(() => clearOutgoing(targetUserId), RING_TIMEOUT_MS);
        return { ok: true };
      } catch {
        return { ok: false, error: 'NETWORK_ERROR' };
      }
    },
    [clearOutgoing],
  );

  const respondToIncomingCall = useCallback(
    async (accept: boolean) => {
      if (!incomingCall) return;
      const { callId, channelId } = incomingCall;
      clearIncoming();

      try {
        const response = await fetch('/api/rtc/call/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId, accept }),
        });
        if (!response.ok) return;
        if (accept) await join(channelId);
      } catch {
        toast({ title: 'Não deu pra responder a chamada', description: 'Tenta de novo.', variant: 'destructive' });
      }
    },
    [incomingCall, clearIncoming, join, toast],
  );

  return (
    <CallContext.Provider
      value={{ incomingCall, respondToIncomingCall, outgoingCallTargetId: outgoingCall?.targetUserId ?? null, startRingCall }}
    >
      {children}
      {incomingCall && <CallModal call={incomingCall} onRespond={respondToIncomingCall} />}
    </CallContext.Provider>
  );
}
