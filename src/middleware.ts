import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routeNames } from '@/app/route.names';

// A experiência de canais é a própria home agora (ver src/app/(channels)) —
// cobre "/", "/<channelId>", "/text" e "/text/<channelId>" (todo path de 1
// segmento só, exceto /admin e /convite tratados antes de chegar aqui, mais o
// caso de 2 segmentos do texto) e as rotas de backend em
// /api/rtc/*, /api/chat/* e /api/channels/* (leitura pública da lista de
// canais, usada pelos hooks de sidebar). Restritos à mesma flag `canalAccess`
// (roles.CANAL_ACCESS ou ADMIN no Postgres, resolvida no callback jwt de
// authOptions.ts).
const CHANNEL_PAGE_MATCHER = /^\/[^/]*$|^\/text\/[^/]+$/;
const CHANNEL_API_MATCHER = /^\/api\/rtc(\/|$)|^\/api\/chat(\/|$)|^\/api\/channels(\/|$)/;
const CHANNEL_ROUTE_MATCHER = new RegExp(`${CHANNEL_PAGE_MATCHER.source}|${CHANNEL_API_MATCHER.source}`);

// Página pública (ver routeNames.INVITE) — não passa pelo gate de canalAccess
// mesmo sendo um path de 1 segmento só, então precisa sair antes do check
// genérico acima.
const PUBLIC_ROUTE_MATCHER = /^\/convite(\/|$)/;

// Quem chama é o servidor do LiveKit, que não tem sessão nenhuma — a rota se
// autentica sozinha pelo header assinado com o API secret (ver WebhookReceiver
// em api/rtc/webhook). Passar pelo gate de canalAccess devolveria 401 pra todo
// evento e a presença por push simplesmente nunca sairia do papel.
const CHANNEL_WEBHOOK_MATCHER = /^\/api\/rtc\/webhook(\/|$)/;

// Coletor de métricas da VPS (ver infra/vps-metrics/, opcional/self-host) —
// sem sessão, mesmo motivo do webhook do LiveKit acima: autentica sozinho por
// secret compartilhado (ver isValidMetricsSecret), passar pelo gate de admin
// devolveria 401 pra todo POST do cron.
const METRICS_INGEST_MATCHER = /^\/api\/admin\/metrics\/ingest(-bandwidth)?(\/|$)/;

// Área administrativa é restrita a ADMIN ou CHANNELS_ACCESS (token.isAdmin /
// token.isChannelsAdmin, resolvidos no callback jwt de authOptions.ts).
const ADMIN_ROUTE_MATCHER = /^\/admin(\/|$)|^\/api\/admin(\/|$)/;
const ADMIN_API_MATCHER = /^\/api\/admin(\/|$)/;
// /admin não tem UI própria — é só um hub que redireciona pra área existente.
// Hoje só existe /admin/channels, então qualquer acesso à raiz (ADMIN ou
// CHANNELS_ACCESS) cai direto lá.
const ADMIN_ROOT_MATCHER = /^\/admin\/?$/;
// Um CHANNELS_ACCESS puro (sem ADMIN) só pode ver a tela de gerenciamento de
// usuários/grupos (/admin/channels) — nada além disso em /admin/*. As rotas
// de API continuam de fora dessa restrição (ADMIN_API_MATCHER já saiu no
// branch acima); cada uma delas já faz sua própria checagem fina
// (isCurrentUserAdmin em grupos/acesso, hasChannelsAdminAccess no toggle).
const CHANNELS_ADMIN_PAGE_MATCHER = /^\/admin\/channels(\/|$)/;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (CHANNEL_WEBHOOK_MATCHER.test(pathname)) return NextResponse.next();
  if (METRICS_INGEST_MATCHER.test(pathname)) return NextResponse.next();
  if (PUBLIC_ROUTE_MATCHER.test(pathname)) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (ADMIN_ROUTE_MATCHER.test(pathname)) {
    const isAdminRoot = ADMIN_ROOT_MATCHER.test(pathname);

    if (Boolean(token?.isAdmin)) {
      if (isAdminRoot) return NextResponse.redirect(new URL(routeNames.ADMIN_CHANNELS, request.url));
      return NextResponse.next();
    }

    if (Boolean(token?.isChannelsAdmin)) {
      if (isAdminRoot) return NextResponse.redirect(new URL(routeNames.ADMIN_CHANNELS, request.url));
      // API é gated por rota (não por página), então segue liberada aqui.
      if (ADMIN_API_MATCHER.test(pathname) || CHANNELS_ADMIN_PAGE_MATCHER.test(pathname)) return NextResponse.next();
      return NextResponse.redirect(new URL(routeNames.ADMIN_CHANNELS, request.url));
    }

    if (ADMIN_API_MATCHER.test(pathname)) {
      return NextResponse.json(
        { error: token ? 'ADMIN_FORBIDDEN' : 'UNAUTHENTICATED' },
        { status: token ? 403 : 401 },
      );
    }

    return NextResponse.redirect(new URL(routeNames.HOME, request.url));
  }

  if (!CHANNEL_ROUTE_MATCHER.test(pathname)) return NextResponse.next();

  const hasAccess = Boolean(token?.canalAccess);
  if (hasAccess) return NextResponse.next();

  if (CHANNEL_API_MATCHER.test(pathname)) {
    return NextResponse.json(
      { error: token ? 'CHANNEL_FORBIDDEN' : 'UNAUTHENTICATED' },
      { status: token ? 403 : 401 },
    );
  }

  // HOME é a própria rota de canais agora — não há mais um lugar neutro pra
  // redirecionar quem não tem acesso (isso faria loop). A página resolve os
  // dois casos sozinha (ver src/app/(channels)/layout.tsx): sem sessão mostra
  // o empty state em skeleton com os botões de login no rodapé da sidebar;
  // com sessão mas sem canalAccess mostra o aviso de acesso pendente.
  return NextResponse.next();
}

export const config = {
  // Roda em quase toda rota (pro gate de canal/admin), exceto assets estáticos,
  // imagens, manifesto/service worker e a própria rota de presença.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/presence|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|xml|txt|webmanifest)$).*)'],
};
