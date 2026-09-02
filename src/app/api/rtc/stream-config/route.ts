import { NextRequest, NextResponse } from 'next/server';
import { ServerError } from 'livekit-server-sdk';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { buildRtcConfig, getVoiceChannels } from '@/lib/rtc/channels';
import { encodeRoomMetadata } from '@/lib/rtc/roomMetadata';
import { parseStreamSettings, type StreamSettings } from '@/lib/rtc/streamQuality';
import { getStreamSettings, setStreamSettings } from '@/lib/rtc/channelsConfig';
import { livekitApi } from '@/lib/rtc/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

// Best-effort, igual ao disconnectAllChannels do kill switch: uma sala fora do
// ar não pode reverter uma configuração que já foi persistida. Quem não receber
// o push pega a config nova no próximo join.
async function pushConfigToChannels(settings: StreamSettings): Promise<void> {
  const metadata = encodeRoomMetadata(buildRtcConfig(settings));
  const channels = await getVoiceChannels();

  await Promise.all(
    channels.map(async (channel) => {
      try {
        await livekitApi().room.updateRoomMetadata(channel.id, metadata);
      } catch (error) {
        // 404 é o caso comum: canal sem ninguém dentro não tem sala no LiveKit.
        if (error instanceof ServerError && error.status === 404) return;
        console.error(`Falha ao propagar a config de transmissão para ${channel.id}`, error);
      }
    })
  );
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  return NextResponse.json({ settings: await getStreamSettings() });
}

export async function PATCH(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const settings = parseStreamSettings((body as { settings?: unknown } | null)?.settings);
  if (!settings) return err(400, 'INVALID_BODY');

  await setStreamSettings(settings);
  await pushConfigToChannels(settings);

  return NextResponse.json({ settings });
}
