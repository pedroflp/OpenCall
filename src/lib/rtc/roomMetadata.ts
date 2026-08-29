import type { RtcConfig } from './channels';

interface RoomMetadata {
  rtcConfig?: RtcConfig;
}

/**
 * Metadata da sala é o canal de push da config de transmissão: o admin salva e
 * o servidor reescreve o metadata de cada canal, o que faz o LiveKit emitir
 * RoomMetadataChanged pra quem já está conectado. Sem isso a mudança só valeria
 * no próximo join, porque `config` viaja no response do /api/rtc/join.
 */
export function encodeRoomMetadata(config: RtcConfig): string {
  return JSON.stringify({ rtcConfig: config } satisfies RoomMetadata);
}

export function decodeRtcConfig(metadata: string | undefined): RtcConfig | null {
  if (!metadata) return null;
  try {
    return (JSON.parse(metadata) as RoomMetadata).rtcConfig ?? null;
  } catch {
    return null;
  }
}
