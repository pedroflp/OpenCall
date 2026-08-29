export interface RateLimitWindow {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const hits = new Map<string, number[]>();

// Sliding window em memória: sem dependência externa (nada de Redis), o que
// cabe no self-host de processo único do LiveKit/Next (ver rtc-infra-constraints
// na memória do projeto). Mesma função serve tanto rotas de servidor (key por
// usuário) quanto o VoiceProvider no client (key só pela ação, uma aba por vez).
export function checkRateLimit(key: string, { windowMs, max }: RateLimitWindow): RateLimitResult {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    return { allowed: false, retryAfterMs: windowMs - (now - recent[0]) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}
