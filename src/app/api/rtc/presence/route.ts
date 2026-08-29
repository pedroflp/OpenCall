import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';
import { loadAllPresence } from '@/lib/rtc/presence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Presença de todos os canais de uma vez. O caminho normal do cliente é o SSE
 * (/api/rtc/presence/events); esta rota é o fallback de quando o stream cai —
 * e um canal a mais aqui não custa nada, porque o store responde os dois pela
 * mesma leitura.
 */
export async function GET() {
  if (!(await isRtcEnabled())) return NextResponse.json({ channels: {} });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  return NextResponse.json({ channels: await loadAllPresence() });
}
