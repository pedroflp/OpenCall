/**
 * Fundo decorativo do palco: dois blobs radiais borrados, animados só via
 * `transform` (compositor, sem JS/WebGL) — troca o antigo ShaderGradientCanvas
 * (Three.js + render loop contínuo) por algo praticamente de graça em CPU/GPU.
 */
export function ChannelBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10" aria-hidden>
      <div className="absolute left-1/2 top-1/2 size-[60vw] max-w-[1200px] animate-pulse rounded-full bg-[#8e7312] blur-[200px]" />
      <div className="absolute right-1/2 bottom-1/2 size-[60vw] max-w-[1200px] animate-pulse rounded-full bg-[#8e7312] blur-[200px]" />
      <div className="absolute left-1/2 top-1/2 size-[60vw] max-w-[900px] animate-drift rounded-full bg-[#c39322] blur-[120px]" />
      <div className="absolute left-1/2 top-1/2 size-[45vw] max-w-[700px] animate-drift-reverse rounded-full bg-black blur-[100px]" />
    </div>
  );
}
