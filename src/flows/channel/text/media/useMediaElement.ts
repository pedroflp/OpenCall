'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { claimPlayback, getSessionVolume, registerMedia, setSessionVolume, subscribeToSessionVolume } from './mediaBus';

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

interface MediaState {
  playing: boolean;
  currentTime: number;
  duration: number;
  /** Fim do trecho já baixado que cobre a posição atual — é o que a faixa cinza do trilho desenha. */
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** Buffer secou no meio da reprodução: o player mostra o spinner sem sair do estado "tocando". */
  waiting: boolean;
  /** Só depois do primeiro play — é o que segura a capa com o botão grande no vídeo. */
  started: boolean;
}

/**
 * Estado de reprodução de um <video>/<audio>, compartilhado pelos dois players
 * (o de vídeo e o de música têm UI bem diferente, mas a mecânica é a mesma).
 *
 * O elemento é a fonte da verdade — o React só espelha o que os eventos dele
 * contam. Guardar tempo/volume em estado e empurrar pro elemento daria dois
 * donos da mesma informação e brigas na hora de arrastar o trilho.
 */
export function useMediaElement(
  ref: React.RefObject<HTMLMediaElement>,
  /** Duração conhecida do DTO — mostra o tempo total antes de o browser pedir o metadata. */
  fallbackDurationMs: number | null,
) {
  const initial = getSessionVolume();
  const [state, setState] = useState<MediaState>({
    playing: false,
    currentTime: 0,
    duration: fallbackDurationMs ? fallbackDurationMs / 1000 : 0,
    bufferedEnd: 0,
    volume: initial.volume,
    muted: initial.muted,
    rate: 1,
    waiting: false,
    started: false,
  });

  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const unregister = registerMedia(el);

    const sync = () =>
      setState((prev) => ({
        ...prev,
        playing: !el.paused && !el.ended,
        currentTime: el.currentTime,
        // `duration` só existe depois do metadata; até lá o valor do DTO segura
        // o número na tela pra ele não aparecer do nada e empurrar o layout.
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : prev.duration,
        bufferedEnd: bufferedEndAt(el),
        volume: el.volume,
        muted: el.muted,
        rate: el.playbackRate,
        started: startedRef.current,
      }));

    const onPlay = () => {
      startedRef.current = true;
      claimPlayback(el);
      setState((prev) => ({ ...prev, playing: true, started: true, waiting: false }));
    };
    const onWaiting = () => setState((prev) => ({ ...prev, waiting: true }));
    const onPlaying = () => setState((prev) => ({ ...prev, waiting: false }));

    el.addEventListener('play', onPlay);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    for (const event of ['pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'volumechange', 'ratechange', 'seeked']) {
      el.addEventListener(event, sync);
    }

    const unsubscribeVolume = subscribeToSessionVolume(sync);
    sync();

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      for (const event of ['pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'volumechange', 'ratechange', 'seeked']) {
        el.removeEventListener(event, sync);
      }
      unsubscribeVolume();
      unregister();
    };
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // play() rejeita quando o browser bloqueia autoplay ou o arquivo não
    // decodifica — sem o catch vira unhandled rejection no console.
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, [ref]);

  const seek = useCallback(
    (seconds: number) => {
      const el = ref.current;
      if (!el) return;
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : seconds;
      el.currentTime = Math.min(Math.max(seconds, 0), max);
      setState((prev) => ({ ...prev, currentTime: el.currentTime }));
    },
    [ref],
  );

  const skip = useCallback(
    (delta: number) => {
      const el = ref.current;
      if (el) seek(el.currentTime + delta);
    },
    [ref, seek],
  );

  const changeVolume = useCallback((volume: number) => setSessionVolume(volume, volume === 0), []);

  const toggleMute = useCallback(() => {
    const { volume, muted } = getSessionVolume();
    // Tirar o mudo com o volume zerado não faria som nenhum e pareceria bug —
    // volta num valor audível.
    if (muted || volume === 0) setSessionVolume(volume > 0 ? volume : 0.5, false);
    else setSessionVolume(volume, true);
  }, []);

  const cycleRate = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const index = PLAYBACK_RATES.indexOf(el.playbackRate as (typeof PLAYBACK_RATES)[number]);
    el.playbackRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
  }, [ref]);

  return { ...state, toggle, seek, skip, changeVolume, toggleMute, cycleRate };
}

function bufferedEndAt(el: HTMLMediaElement): number {
  for (let i = 0; i < el.buffered.length; i += 1) {
    if (el.buffered.start(i) <= el.currentTime && el.currentTime <= el.buffered.end(i)) return el.buffered.end(i);
  }
  return 0;
}
