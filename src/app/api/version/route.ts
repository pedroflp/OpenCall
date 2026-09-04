import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { appCommit } from '@/lib/appCommit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Commit do processo que atendeu ESTA requisição. Cada poll é uma requisição
 * nova, roteada pro container que está no ar agora — é o que detecta o deploy
 * mesmo quando o stream de /api/version/events continua pendurado no container
 * velho (ver useAppVersion).
 *
 * Fechado por sessão pelo mesmo motivo do stream: o aviso só existe pra quem
 * está logado, e não há razão pra deixar identificação de build aberta.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  return Response.json({ commit: appCommit() }, { headers: { 'Cache-Control': 'no-store' } });
}
