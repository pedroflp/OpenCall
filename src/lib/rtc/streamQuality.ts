export type StreamPresetId = 'economico' | 'equilibrado' | 'fluido' | 'alta';
export type StreamPreset = StreamPresetId | 'custom';
export type DegradationPreference = 'maintain-framerate' | 'maintain-resolution';

export interface StreamSettings {
  preset: StreamPreset;
  height: number;
  frameRate: number;
  maxBitrateKbps: number;
  degradationPreference: DegradationPreference;
}

// Só a altura é armazenada — a largura sai da tabela. Guardar o par inteiro
// abriria espaço pra um 1920×540 salvo por engano, que nenhuma validação de
// campo isolado pegaria.
export const RESOLUTION_OPTIONS = [
  { height: 540, width: 960, label: '540p' },
  { height: 720, width: 1280, label: '720p' },
  { height: 1080, width: 1920, label: '1080p' },
] as const;

export const FRAME_RATE_OPTIONS = [24, 30, 60] as const;
export const BITRATE_OPTIONS_KBPS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 7000, 10000] as const;

// Só o VALOR: `label` e `hint` viraram `admin.stream.degradation.<valor>` no
// catálogo. Este módulo é lido pelo servidor pra montar o RtcConfig, e ali não
// existe leitor cuja língua consultar.
export const DEGRADATION_OPTIONS = [{ value: 'maintain-framerate' }, { value: 'maintain-resolution' }] as const;

// Resolução e bitrate andam juntos: subir só o teto de bitrate não produz efeito
// nenhum, porque a captura já sai na resolução final e o encoder continua
// recebendo o mesmo quadro pequeno (ver docs/migração-self-host.md §6.1). É por
// isso que o painel oferece preset como controle principal — o modo avançado
// existe pra calibrar, não pra ser o caminho normal.
// Mesmo caso do DEGRADATION_OPTIONS acima: aqui só os números, os textos em
// `admin.stream.presets.<id>`.
export const STREAM_PRESETS: Record<
  StreamPresetId,
  { height: number; frameRate: number; maxBitrateKbps: number }
> = {
  economico: {
    height: 540,
    frameRate: 30,
    maxBitrateKbps: 1500,
  },
  equilibrado: {
    height: 720,
    frameRate: 30,
    maxBitrateKbps: 2500,
  },
  // Dobrar o framerate exige mais ou menos o dobro de bitrate pra sustentar a
  // mesma nitidez — 60 fps a 2500 kbps não seria "mais fluido", seria a mesma
  // fluidez com a imagem pior.
  fluido: {
    height: 720,
    frameRate: 60,
    maxBitrateKbps: 4000,
  },
  alta: {
    height: 1080,
    frameRate: 30,
    maxBitrateKbps: 5000,
  },
};

/** Mantém o comportamento que estava hard-coded antes do painel existir. */
export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  preset: 'alta',
  height: STREAM_PRESETS.alta.height,
  frameRate: STREAM_PRESETS.alta.frameRate,
  maxBitrateKbps: STREAM_PRESETS.alta.maxBitrateKbps,
  degradationPreference: 'maintain-framerate',
};

const FALLBACK_RESOLUTION = RESOLUTION_OPTIONS[RESOLUTION_OPTIONS.length - 1];

export function widthForHeight(height: number): number {
  return RESOLUTION_OPTIONS.find((option) => option.height === height)?.width ?? FALLBACK_RESOLUTION.width;
}

function isDegradationPreference(value: unknown): value is DegradationPreference {
  return DEGRADATION_OPTIONS.some((option) => option.value === value);
}

/**
 * Fonte única de validação: usada tanto na leitura do Firestore quanto no PATCH
 * do admin. Devolve null pra qualquer coisa fora das opções oferecidas — quem
 * lê troca por DEFAULT_STREAM_SETTINGS, quem escreve responde 400.
 *
 * Preset conhecido ignora os valores recebidos e reconstrói a partir da tabela:
 * assim é impossível salvar um "equilibrado" que na verdade está em 1080p.
 */
export function parseStreamSettings(raw: unknown): StreamSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<StreamSettings>;

  if (!isDegradationPreference(value.degradationPreference)) return null;
  const degradationPreference = value.degradationPreference;

  if (value.preset && value.preset !== 'custom') {
    const preset = STREAM_PRESETS[value.preset as StreamPresetId];
    if (!preset) return null;
    return {
      preset: value.preset,
      height: preset.height,
      frameRate: preset.frameRate,
      maxBitrateKbps: preset.maxBitrateKbps,
      degradationPreference,
    };
  }

  if (!RESOLUTION_OPTIONS.some((option) => option.height === value.height)) return null;
  if (!FRAME_RATE_OPTIONS.some((option) => option === value.frameRate)) return null;
  if (!BITRATE_OPTIONS_KBPS.some((option) => option === value.maxBitrateKbps)) return null;

  return {
    preset: 'custom',
    height: value.height!,
    frameRate: value.frameRate!,
    maxBitrateKbps: value.maxBitrateKbps!,
    degradationPreference,
  };
}
