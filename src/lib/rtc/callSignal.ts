/**
 * "Ligar para entrar": ringar um usuário específico já online/ausente na
 * plataforma, fora de qualquer sala LiveKit (diferente de callAttention, que
 * já pressupõe os dois dentro do mesmo Room — ver VoiceProvider). Entrega em
 * tempo real via SSE (ver /api/rtc/call/events), sem WebSocket/Pusher: app
 * roda como container único no Railway, então um pub-sub em memória por
 * processo já resolve, mesmo padrão de src/lib/presence/platformPresence.ts.
 */

export type CallEvent =
  | { type: 'incoming'; callId: string; from: { id: string; username: string; avatar: string }; channelId: string; channelName: string }
  | { type: 'ended'; callId: string; outcome: 'accepted' | 'rejected' | 'timeout' };

type Send = (event: CallEvent) => void;

export interface PendingCall {
  id: string;
  callerId: string;
  targetId: string;
  channelId: string;
  timeout: ReturnType<typeof setTimeout>;
}

/** Uma entrada por aba aberta com o EventSource conectado. */
const subscribers = new Map<string, Set<Send>>();

/** No máximo uma ligação recebida pendente por destinatário. */
const pendingCallsByTarget = new Map<string, PendingCall>();

/** Chave `${callerId}:${targetId}` — cooldown começa quando a ligação termina, não quando é iniciada (ver endCall). */
const cooldownUntil = new Map<string, number>();

const RING_TIMEOUT_MS = 20_000;
export const CALL_COOLDOWN_MS = 60_000;

export function subscribeToCallEvents(userId: string, send: Send): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
    if (set!.size === 0) subscribers.delete(userId);
  };
}

function publish(userId: string, event: CallEvent) {
  const set = subscribers.get(userId);
  if (!set) return;
  for (const send of set) send(event);
}

export function getCallCooldownRemaining(callerId: string, targetId: string): number {
  const until = cooldownUntil.get(`${callerId}:${targetId}`);
  if (!until) return 0;
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Termina a ligação (aceita/recusada/expirada), avisa os dois lados (todas as abas) e só aí começa o cooldown de 1min. */
function endCall(call: PendingCall, outcome: 'accepted' | 'rejected' | 'timeout') {
  clearTimeout(call.timeout);
  const current = pendingCallsByTarget.get(call.targetId);
  if (current?.id === call.id) pendingCallsByTarget.delete(call.targetId);
  cooldownUntil.set(`${call.callerId}:${call.targetId}`, Date.now() + CALL_COOLDOWN_MS);
  publish(call.callerId, { type: 'ended', callId: call.id, outcome });
  publish(call.targetId, { type: 'ended', callId: call.id, outcome });
}

export function startCall(params: {
  callerId: string;
  targetId: string;
  channelId: string;
  channelName: string;
  from: { id: string; username: string; avatar: string };
}): PendingCall {
  const { callerId, targetId, channelId, channelName, from } = params;

  // Uma nova ligação pro mesmo destinatário substitui a anterior (raro: exigiria já
  // ter passado no gate de cooldown de novo, então na prática é só troca de estado).
  const existing = pendingCallsByTarget.get(targetId);
  if (existing) endCall(existing, 'timeout');

  const id = `${callerId}-${targetId}-${Date.now()}`;
  const timeout = setTimeout(() => {
    const current = pendingCallsByTarget.get(targetId);
    if (current?.id === id) endCall(current, 'timeout');
  }, RING_TIMEOUT_MS);

  const call: PendingCall = { id, callerId, targetId, channelId, timeout };
  pendingCallsByTarget.set(targetId, call);

  publish(targetId, { type: 'incoming', callId: id, from, channelId, channelName });
  return call;
}

export function respondToCall(targetId: string, callId: string, accept: boolean): PendingCall | null {
  const call = pendingCallsByTarget.get(targetId);
  if (!call || call.id !== callId) return null;
  endCall(call, accept ? 'accepted' : 'rejected');
  return call;
}
