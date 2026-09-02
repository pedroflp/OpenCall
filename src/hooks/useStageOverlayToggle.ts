'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

/**
 * Clicar no vídeo esconde a UI sobreposta; clicar de novo traz de volta.
 *
 * Existe porque em tela cheia a transmissão é o conteúdo, e o nome do streamer
 * e a cápsula de controles ficam permanentemente por cima dela — sobre um jogo
 * ou um código, os dois cantos ocupados atrapalham justamente quem foi assistir.
 * É o gesto que todo player tem, e a expectativa vem de fora do app.
 *
 * ONDE O CLIQUE VALE, e por que não é `stopPropagation` nos controles: os
 * popovers do palco (volume, opções de admin) são portados PARA DENTRO do
 * wrapper — recebem `container={stageRef.current}` pra sobreviver ao
 * fullscreen —, então um clique dentro deles borbulha até aqui como se fosse
 * clique no vídeo. Marcar cada superfície com um handler que trava a
 * propagação deixaria de fora exatamente esse conteúdo portado, que nasce
 * fora da árvore de JSX.
 *
 * Por isso o critério é positivo em vez de negativo: só o PRÓPRIO wrapper e o
 * `<video>` alternam. Qualquer outra coisa clicada — botão, badge, avatar,
 * popover portado, conteúdo que ainda nem existe — não é "clicar na tela".
 *
 * Ligado só onde faz sentido (`enabled`): fora da tela cheia o vídeo é um card
 * 16:9 com os controles logo abaixo, e ali esconder não ganha nada. Ao sair da
 * tela cheia a UI volta sozinha — sair com ela escondida deixaria a pessoa numa
 * tela sem controles e sem pista do porquê.
 */
export interface StageOverlayToggle {
  /** No wrapper da transmissão. */
  onStageClick: (event: MouseEvent<HTMLElement>) => void;
  /** Em cada bloco sobreposto ao vídeo — mesma transição nos três palcos. */
  overlayClassName: string;
  /** Pra quem precisa do estado além da classe (`aria-hidden`, por exemplo). */
  visible: boolean;
}

export function useStageOverlayToggle(enabled: boolean): StageOverlayToggle {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) setVisible(true);
  }, [enabled]);

  const onStageClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!enabled) return;
      const target = event.target as HTMLElement;
      if (target !== event.currentTarget && target.tagName !== 'VIDEO') return;
      setVisible((current) => !current);
    },
    [enabled]
  );

  return {
    onStageClick,
    // `pointer-events-none` junto com a opacidade, senão o que sumiu continua
    // clicável e o primeiro clique pra trazer a UI de volta cairia num botão
    // invisível. A duração é a mesma dos outros overlays do app.
    overlayClassName: visible
      ? 'transition-opacity duration-300 opacity-100'
      : 'transition-opacity duration-300 opacity-0 pointer-events-none',
    visible,
  };
}
