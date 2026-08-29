import { widthForHeight, type DegradationPreference, type StreamSettings } from './streamQuality';

export interface Channel {
  id: string;
  name: string;
  maxParticipants: number;
}

export const CHANNELS: Record<string, Channel> = {
  geral: { id: 'geral', name: 'Geral', maxParticipants: 20 },
  primos: { id: 'primos', name: 'Primos', maxParticipants: 20 },
};

export const CHANNEL_LIST: Channel[] = Object.values(CHANNELS);

export const DEFAULT_CHANNEL_ID = 'geral';

export function getChannel(id: string): Channel | undefined {
  return CHANNELS[id];
}

// Resolução de origem, framerate e teto de bitrate agora vêm do painel do admin
// (ver channelsConfig) — resolução e bitrate precisam andar juntos, o que é
// justamente o que os presets garantem. Codec e DTX seguem fixos: não são
// escolha de operação, e trocar codec em runtime tem efeito colateral na sala
// inteira (backupCodec derruba todo mundo pra VP8).
const SCREEN_SHARE_CODEC = 'vp9';
const DTX_ENABLED = true;

export interface RtcConfig {
  screenShareMaxBitrate: number;
  screenShareMaxFramerate: number;
  screenShareWidth: number;
  screenShareHeight: number;
  screenShareCodec: typeof SCREEN_SHARE_CODEC;
  screenShareDegradationPreference: DegradationPreference;
  dtx: boolean;
}

export function buildRtcConfig(settings: StreamSettings): RtcConfig {
  return {
    screenShareMaxBitrate: settings.maxBitrateKbps * 1000,
    screenShareMaxFramerate: settings.frameRate,
    screenShareWidth: widthForHeight(settings.height),
    screenShareHeight: settings.height,
    screenShareCodec: SCREEN_SHARE_CODEC,
    screenShareDegradationPreference: settings.degradationPreference,
    dtx: DTX_ENABLED,
  };
}
