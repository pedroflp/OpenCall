const SKELETON_ROWS = 8;

function PlatformUserRowSkeleton() {
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 animate-pulse">
      <div className="h-8 w-8 shrink-0 rounded-full bg-muted/60" />
      <div className="h-4 w-24 rounded-md bg-muted/60" />
    </li>
  );
}

/**
 * Espelha o `<aside>` de PlatformUsersSidebar/index.tsx — mesma largura,
 * padding e scroll da versão real, só trocando as linhas de usuário por
 * placeholders. Reutilizado tanto pelo loading state do próprio componente
 * quanto pelo empty state de /channels pra quem não está autenticado.
 */
export function PlatformUsersSidebarSkeleton() {
  return (
    <aside className="hidden lg:flex w-60 mt-4 shrink-0 flex-col overflow-hidden bg-card">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        <ul className="flex flex-col gap-1">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <PlatformUserRowSkeleton key={index} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
