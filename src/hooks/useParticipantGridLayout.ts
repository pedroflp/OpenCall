'use client';

import { useEffect, useState, type RefObject } from 'react';

const GAP_PX = 16;
const MIN_TILE_WIDTH = 220;
const MAX_TILE_WIDTH = 420;
const MIN_TILE_HEIGHT = 120;
const ASPECT_RATIO = 16 / 9;

/**
 * Número de colunas por contagem de participantes, não por largura
 * disponível (isso é o `tileWidth` que resolve, ver abaixo). Até 3 cabem
 * numa linha só; a partir de 4, sempre 2 colunas — nunca um card sozinho
 * numa linha quando dá pra evitar (4 vira 2+2, não 3+1). Um sozinho no
 * final só acontece quando é matematicamente inevitável (5 vira 2+2+1).
 */
export function participantGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  return 2;
}

export interface ParticipantGridLayout {
  columns: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Tamanho de tile calculado a partir do espaço real disponível — largura E
 * altura, não só largura. Sem isso, com poucas colunas (logo várias linhas)
 * e pouca altura de tela, os cards mantinham o tamanho "natural" (16:9 a
 * partir da largura) e os das pontas ficavam cortados em vez de encolher
 * pra caber. Aqui os dois eixos disputam: o mais apertado vence, e o card
 * encolhe mantendo a proporção 16:9 até um piso mínimo — abaixo dele, quem
 * segura é o scroll do container (ver ConnectedStage), não mais compressão.
 */
export function useParticipantGridLayout(count: number, containerRef: RefObject<HTMLElement | null>): ParticipantGridLayout {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const columns = participantGridColumns(count);
  const rows = Math.max(1, Math.ceil(count / columns));

  if (size.width === 0 || size.height === 0) {
    return { columns, tileWidth: MAX_TILE_WIDTH, tileHeight: MAX_TILE_WIDTH / ASPECT_RATIO };
  }

  const widthPerTile = (size.width - (columns - 1) * GAP_PX) / columns;
  const heightPerTile = (size.height - (rows - 1) * GAP_PX) / rows;

  // Câmera é sempre 16:9 — o eixo mais apertado (largura ou altura
  // disponível) manda no tamanho final, nunca os dois soltos, senão o outro
  // eixo estoura.
  let tileWidth = Math.min(widthPerTile, heightPerTile * ASPECT_RATIO, MAX_TILE_WIDTH);
  tileWidth = Math.max(tileWidth, MIN_TILE_WIDTH);
  let tileHeight = tileWidth / ASPECT_RATIO;

  if (tileHeight < MIN_TILE_HEIGHT) {
    tileHeight = MIN_TILE_HEIGHT;
    tileWidth = Math.min(MAX_TILE_WIDTH, tileHeight * ASPECT_RATIO);
  }

  return { columns, tileWidth, tileHeight };
}
