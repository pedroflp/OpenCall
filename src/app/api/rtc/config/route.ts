import { NextRequest, NextResponse } from 'next/server';
import { ServerError } from 'livekit-server-sdk';
import { getUser, isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { isRtcEnabled, setRtcEnabled } from '@/lib/rtc/channelsConfig';
import { getVoiceChannels } from '@/lib/rtc/channels';
import { livekitApi } from '@/lib/rtc/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  return NextResponse.json({ enabled: await isRtcEnabled() });
}

// Desligar não é só bloquear entradas novas — quem já estava numa call fica
// consumindo recurso do LiveKit até sair por conta própria. deleteRoom encerra
// a sala inteira (derruba todo mundo de uma vez, mais barato que um
// removeParticipant por pessoa) e libera o recurso na hora. Best-effort: uma
// falha aqui não deve reverter o toggle, que já foi persistido — pior caso é
// a sala levar até o próximo poll de presença pra esvaziar de fato.
async function disconnectAllChannels(): Promise<void> {
  const channels = await getVoiceChannels();
  await Promise.all(
    channels.map(async (channel) => {
      try {
        await livekitApi().room.deleteRoom(channel.id);
      } catch (error) {
        if (error instanceof ServerError && error.status === 404) return;
        console.error(`Falha ao encerrar a sala do canal ${channel.id}`, error);
      }
    })
  );
}

export async function PATCH(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const enabled = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== 'boolean') return err(400, 'INVALID_BODY');

  await setRtcEnabled(enabled);
  if (!enabled) await disconnectAllChannels();

  return NextResponse.json({ enabled });
}
