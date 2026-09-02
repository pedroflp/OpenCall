import { NextRequest, NextResponse } from 'next/server';
import { ChannelType } from '@prisma/client';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getChannelsByType } from '@/lib/rtc/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

function parseType(raw: string | null): ChannelType | null {
  return raw === ChannelType.VOICE || raw === ChannelType.TEXT ? raw : null;
}

/**
 * Leitura pública (canalAccess, via middleware) da lista de canais ativos de
 * um tipo — usada pelos hooks de sidebar (useVoiceChannels/useTextChannels)
 * e por qualquer client component que precise da lista sem poder importar
 * lib/rtc/channels diretamente (Prisma não roda no bundle client).
 */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const type = parseType(new URL(req.url).searchParams.get('type'));
  if (!type) return err(400, 'INVALID_TYPE');

  const channels = await getChannelsByType(type);
  return NextResponse.json({ channels });
}
