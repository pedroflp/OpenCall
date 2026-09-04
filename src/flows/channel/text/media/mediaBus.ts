'use client';

/**
 * Registro em módulo de todo <video>/<audio> montado no chat.
 *
 * Serve a duas coisas que só existem no plural:
 *
 * - **Um som por vez** (D7 da RFC de anexos): rolar o canal e clicar em três
 *   vídeos tocaria os três juntos. Quem dá play reivindica o canal e pausa o
 *   resto.
 * - **Volume compartilhado**: baixar o volume num player e o próximo vir a 100%
 *   é o tipo de coisa que faz a pessoa desistir de usar o player. A preferência
 *   vale pela sessão (aba), sem persistir — é ajuste de momento, não
 *   configuração.
 */

const players = new Set<HTMLMediaElement>();

let sessionVolume = 1;
let sessionMuted = false;

const volumeListeners = new Set<() => void>();

export function registerMedia(element: HTMLMediaElement): () => void {
  players.add(element);
  element.volume = sessionVolume;
  element.muted = sessionMuted;
  return () => {
    players.delete(element);
  };
}

/** Chamado no `play` de um player: todo o resto pausa. */
export function claimPlayback(element: HTMLMediaElement): void {
  players.forEach((other) => {
    if (other !== element && !other.paused) other.pause();
  });
}

export function getSessionVolume(): { volume: number; muted: boolean } {
  return { volume: sessionVolume, muted: sessionMuted };
}

export function setSessionVolume(volume: number, muted: boolean): void {
  sessionVolume = Math.min(1, Math.max(0, volume));
  sessionMuted = muted;
  players.forEach((player) => {
    player.volume = sessionVolume;
    player.muted = sessionMuted;
  });
  volumeListeners.forEach((listener) => listener());
}

/** Os outros players na tela precisam redesenhar o próprio ícone/trilho de volume quando um deles muda. */
export function subscribeToSessionVolume(listener: () => void): () => void {
  volumeListeners.add(listener);
  return () => {
    volumeListeners.delete(listener);
  };
}
