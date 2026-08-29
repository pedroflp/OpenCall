// Fonte da verdade de fato é o servidor (COOLDOWN_MS em api/rtc/invite) — esse
// Map só existe pra sobreviver ao remount do CallAction quando o popover fecha
// e abre de novo (Radix desmonta o PopoverContent, o que zerava o useState do
// cooldown e fazia o botão parecer disponível antes da hora).
const cooldownUntil = new Map<string, number>();
// Só usado pelo namespace `ring:` (useRingAction) pra saber se o cooldown
// atual é de uma recusa — decide se a linha do usuário mostra "Recusado".
const cooldownOutcome = new Map<string, 'rejected'>();

export function getCallCooldownRemaining(targetUserId: string): number {
  const until = cooldownUntil.get(targetUserId);
  if (!until) return 0;

  const remaining = until - Date.now();
  if (remaining <= 0) {
    cooldownUntil.delete(targetUserId);
    cooldownOutcome.delete(targetUserId);
    return 0;
  }
  return remaining;
}

export function getCallCooldownOutcome(targetUserId: string): 'rejected' | null {
  if (getCallCooldownRemaining(targetUserId) <= 0) return null;
  return cooldownOutcome.get(targetUserId) ?? null;
}

export function setCallCooldown(targetUserId: string, remainingMs: number, outcome?: 'rejected'): void {
  cooldownUntil.set(targetUserId, Date.now() + remainingMs);
  if (outcome) {
    cooldownOutcome.set(targetUserId, outcome);
  } else {
    cooldownOutcome.delete(targetUserId);
  }
}
