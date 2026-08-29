'use client';

import { useEffect, useRef, useState } from 'react';

const IDLE_DIM_DELAY_MS = 15_000;
const RESET_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;

/**
 * Mantém a tela acesa (Wake Lock) enquanto `active`, escurecendo a UI depois de
 * um tempo parado pra não deixar o celular queimando brilho na mesa. Qualquer
 * toque devolve o brilho normal. Não existe API pra baixar o brilho real da
 * tela no iOS — isso simula com um overlay preto (em telas OLED, que é a
 * maioria dos iPhones, o efeito de economia é bem próximo do real).
 */
export function useCallWakeLockDim(active: boolean) {
  const [dimmed, setDimmed] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // negado pelo SO (bateria baixa, preferência do usuário etc.) — sem contorno possível
      }
    }

    void acquire();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) void acquire();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      setDimmed(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    function resetIdleTimer() {
      setDimmed(false);
      clearTimeout(timer);
      timer = setTimeout(() => setDimmed(true), IDLE_DIM_DELAY_MS);
    }

    resetIdleTimer();
    RESET_EVENTS.forEach((event) => window.addEventListener(event, resetIdleTimer));

    return () => {
      clearTimeout(timer);
      RESET_EVENTS.forEach((event) => window.removeEventListener(event, resetIdleTimer));
    };
  }, [active]);

  return dimmed;
}
