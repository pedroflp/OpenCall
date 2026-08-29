'use client';

import { useEffect, useRef } from 'react';

/** Osciloscópio simples do que o AnalyserNode está captando — só desenha enquanto ativo. */
export default function AudioWaveform({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.scale(dpr, dpr);

    // Lê a cor resolvida do token do Tailwind (text-primary) em vez de fixar um
    // hex — assim acompanha o tema claro/escuro sem duplicar a paleta aqui.
    const strokeStyle = getComputedStyle(canvas).color;

    const data = new Uint8Array(analyser.fftSize);
    let raf: number;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = strokeStyle;
      ctx.beginPath();

      const slice = cssWidth / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128 - 1;
        const y = cssHeight / 2 + v * (cssHeight / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);

  if (!active) return null;

  return <canvas ref={canvasRef} className="h-9 w-full rounded-md bg-muted/30 text-primary" />;
}
