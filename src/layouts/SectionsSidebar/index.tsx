'use client'

import { routeNames } from "@/app/route.names";
import { UserDTO } from "@/app/api/user/types";
import { hasCanalAccess } from "@/lib/access";
import { HugeIcon } from "@/components/HugeIcon";
import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DiscordOAuth from "@/components/DiscordOAuth";
import QrLoginButton from "@/components/QrLoginButton";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * `text` e `title` são CHAVES de `nav`, não texto pronto: a lista é montada
 * fora do render (`getSections` é chamada de dentro de um `useMemo`), e é o JSX
 * lá embaixo que traduz. Também é ele que usa a chave como `key` do React — o
 * que continua certo: a chave é estável, o texto traduzido não seria.
 */
type SidebarLink = {
  text: 'administration';
  href: string;
  icon: string;
  disabled?: boolean;
}

type SidebarSection = {
  title: 'platform';
  icon?: ReactNode;
  links: SidebarLink[];
}

function getSections(canAccessAdmin: boolean): SidebarSection[] {
  return [
    {
      title: 'platform',
      links: [
        // ADMIN entra na área inteira; CHANNELS_ACCESS só em /admin e
        // /admin/channels (ver middleware.ts) — de qualquer forma o hub em
        // /admin já resolve pra qualquer um dos dois, então o link é o mesmo.
        ...(canAccessAdmin ? [{ text: 'administration' as const, href: routeNames.ADMIN, icon: 'shield-01' }] : []),
      ],
    },
  ];
}

function OpenCallBanner({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('nav');
  const href = routeNames.CHANNELS;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={href} className="flex items-center justify-center p-2">
            <Image src="/assets/icons/opencall-banner.png" width={80} height={80} alt="OpenCall" className="pointer-events-none size-10 shrink-0 rounded-md" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">OpenCall</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center gap-2 relative overflow-hidden rounded-3xl bg-primary/10 p-4 transition-colors hover:bg-primary/20"
    >
      <Image src="/assets/icons/opencall-banner.png" width={80} height={80} alt="OpenCall" className="pointer-events-none size-12 shrink-0 rounded-lg" />
      <Image src="/assets/icons/opencall-banner.png" width={200} height={200} alt="OpenCall" className="pointer-events-none shrink-0 opacity-20 blur-[2px] rounded-lg absolute translate-y-1/2 bottom-1/4 right-8 translate-x-1/2" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-bold text-foreground">OpenCall</p>
        <p className="truncate text-xs text-primary/50">{t('seeChannels')}</p>
      </div>
      <HugeIcon
        name="arrow-right-01"
        size={18}
        className="shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

const COOKIE_KEY = 'opencall:sidebar:collapsed'
const EXPANDED_WIDTH = 300
const COLLAPSED_WIDTH = 88

function readCollapsedCookie(): boolean {
  if (typeof document === 'undefined') return false
  const match = document.cookie.match(/(?:^|; )opencall:sidebar:collapsed=([^;]*)/)
  return match?.[1] === '1'
}

export default function SectionsSidebar({ user, initialCollapsed }: { user: UserDTO | null, initialCollapsed?: boolean }) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);
  const canalAccess = hasCanalAccess(user?.roles);
  const isAdmin = Boolean(session?.user?.isAdmin);
  const canAccessAdmin = isAdmin || Boolean(session?.user?.isChannelsAdmin);
  const sections = useMemo(() => getSections(canAccessAdmin), [canAccessAdmin]);
  const effectiveCollapsed = collapsed

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      document.cookie = `${COOKIE_KEY}=${next ? '1' : '0'}; path=/; max-age=31536000`
      return next
    })
  }

  // Pages can override the collapsed state for their lifetime by dispatching
  // a `opencall:sidebar:override` event with `{ collapsed: boolean | null }`.
  // `null` reverts to the cookie-driven preference. The cookie itself is not
  // touched, so the user's manual choice survives the override.
  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<{ collapsed: boolean | null }>).detail
      if (!detail) return
      if (detail.collapsed === null) {
        setCollapsed(readCollapsedCookie())
      } else {
        setCollapsed(detail.collapsed)
      }
    }
    window.addEventListener('opencall:sidebar:override', handle as EventListener)
    return () => window.removeEventListener('opencall:sidebar:override', handle as EventListener)
  }, [])

  async function handleSignOut(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await signOut()
  }

  return (
    <TooltipProvider delayDuration={120}>
      <aside
        className="shrink-0 h-full flex flex-col text-nowrap overflow-hidden transition-[width] duration-300 ease-in-out bg-muted/30"
        style={{ width: effectiveCollapsed ? COLLAPSED_WIDTH : (isMobile ? '100vw' : EXPANDED_WIDTH) }}
      >
        {/* Header: logo (always visible). When collapsed, hovering the
            header crossfades the logo out and the expand button in over the
            same spot. When expanded, the collapse button sits on the right. */}
        <header className={cn(
          "group/header relative flex items-center gap-3 h-[68px] pt-6 pb-4",
          effectiveCollapsed ? 'px-4 justify-center' : 'px-6 justify-between',
        )}>
          <Link
            href={routeNames.HOME}
            className={cn(
              "relative flex items-center text-2xl font-black text-foreground shrink-0 h-8 transition-opacity duration-200",
              effectiveCollapsed && 'group-hover/header:opacity-0',
            )}
          >
            <HugeIcon name="shield-01" size={32} />
            <span
              className={cn(
                "absolute left-[40px] top-1/2 -translate-y-1/2 transition-opacity duration-200",
                effectiveCollapsed ? 'opacity-0' : 'opacity-100 delay-[1000ms]',
              )}
            >
              OpenCall
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            className={cn(
              "transition-opacity duration-200",
              collapsed
                ? 'absolute left-1/2 top-[34px] -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/header:opacity-100'
                : 'opacity-100',
            )}
          >
            <HugeIcon name="layout-left" size={20} />
          </Button>
        </header>

        <div className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-6 flex flex-col gap-6",
          effectiveCollapsed ? 'px-2' : 'px-4',
        )}>
          {canalAccess && <OpenCallBanner collapsed={effectiveCollapsed} />}
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-1">
              {effectiveCollapsed ? (
                null
              ) : section.icon ? (
                <div className="py-1 px-3">
                  {section.icon}
                </div>
              ) : (
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground px-3 mb-2">
                  {t(section.title)}
                </h2>
              )}
              <nav className="flex flex-col gap-1">
                {section.links.map(link => {
                  const isActive = pathname === link.href
                  const linkContent = (
                    <Link
                      key={link.text}
                      href={link.href}
                      aria-disabled={link.disabled}
                      className={cn(
                        'relative group flex items-center rounded-md text-foreground transition-colors py-2.5',
                        'hover:bg-secondary/60',
                        isActive && 'bg-secondary/80',
                        link.disabled && 'pointer-events-none opacity-50',
                        effectiveCollapsed ? 'px-2 justify-center' : 'px-3 gap-4',
                      )}
                    >
                      <span
                        className={cn(
                          'shrink-0 flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                          'bg-primary/10 text-primary',
                          'group-hover:bg-primary/20',
                          isActive && 'bg-primary/25',
                        )}
                      >
                        <HugeIcon name={link.icon} size={24} />
                      </span>
                      <span
                        className={cn(
                          "absolute left-[64px] right-3 text-base text-foreground pointer-events-none truncate transition-opacity duration-200",
                          effectiveCollapsed ? 'opacity-0' : 'opacity-100 delay-[1000ms]',
                        )}
                      >
                        {t(link.text)}
                      </span>
                    </Link>
                  )

                  if (!effectiveCollapsed) return linkContent

                  return (
                    <Tooltip key={link.text}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right">{t(link.text)}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </nav>
            </section>
          ))}
        </div>

        <div className={cn(effectiveCollapsed ? 'p-2' : 'px-3 py-3')}>
          {status === 'loading' && !user ? (
            <Skeleton className={cn("rounded-md", effectiveCollapsed ? 'h-10 w-10 mx-auto' : 'h-12 w-full')} />
          ) : user ? (
            effectiveCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center rounded-md p-1">
                    <Avatar size={10} image={user.avatar} fallback={String(user.username).slice(0, 2)} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{user.username}</TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-1 transition-opacity duration-200 opacity-100 delay-[1000ms]">
                <div className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-md">
                  <Avatar size={10} image={user.avatar} fallback={String(user.username).slice(0, 2)} />
                  <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {user.username}
                    </span>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSignOut}
                      aria-label={tCommon('signOut')}
                      className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    >
                      <HugeIcon name="logout-01" size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{tCommon('signOut')}</TooltipContent>
                </Tooltip>
              </div>
            )
          ) : (
            <div className={cn('flex gap-2', effectiveCollapsed ? 'flex-col items-center' : 'flex-col px-2')}>
              <QrLoginButton collapsed={effectiveCollapsed} />
              <DiscordOAuth collapsed={effectiveCollapsed} />
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
