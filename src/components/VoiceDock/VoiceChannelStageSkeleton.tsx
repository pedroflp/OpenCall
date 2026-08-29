/**
 * Espelha PreJoinStage (ver VoiceChannelStage.tsx): header de 52px com ícone e
 * nome, e a grade de participantes centralizada em avatares de 110px seguida
 * do botão de entrar. Compartilhado entre o loading.tsx de /channels e o
 * empty state renderizado pra quem não está autenticado.
 */
export function VoiceChannelStageSkeleton() {
  return (
    <div className="relative hidden h-full min-w-0 flex-1 animate-pulse bg-background min-[900px]:flex">
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/40 px-4">
          <div className="size-[19px] rounded bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-9 p-10">
          <div className="flex flex-wrap justify-center gap-7">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex w-[110px] flex-col items-center gap-2.5">
                <div className="size-20 rounded-full bg-muted" />
                <div className="h-3.5 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>

          <div className="h-10 w-40 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
