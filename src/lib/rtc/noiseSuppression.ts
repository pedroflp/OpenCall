import type { AudioCaptureOptions, LocalAudioTrack } from 'livekit-client';

export type NoiseSuppressionMode = 'default' | 'krisp';

const STORAGE_KEY = 'opencall:voice:noise-suppression-mode';

export function loadNoiseSuppressionMode(): NoiseSuppressionMode {
  if (typeof window === 'undefined') return 'default';
  return localStorage.getItem(STORAGE_KEY) === 'krisp' ? 'krisp' : 'default';
}

export function saveNoiseSuppressionMode(mode: NoiseSuppressionMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

// Tracks fora de uma Room (o preview de "ouvir a si mesmo") nunca ganham um
// AudioContext sozinhas — dentro da Room quem seta é o próprio LiveKit antes
// de publicar (LocalParticipant.createTracks/publishTrack). setProcessor()
// lança "Audio context needs to be set on LocalAudioTrack" sem isso.
export function createAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : undefined;
}

let krispSupportCache: Promise<boolean> | null = null;

// O pacote do Krisp baixa o modelo (WASM) sob demanda — import dinâmico pra não
// pesar no bundle de quem nunca abre o seletor de supressão de ruído.
export function isKrispSupported(): Promise<boolean> {
  if (!krispSupportCache) {
    krispSupportCache = import('@livekit/krisp-noise-filter')
      .then(({ isKrispNoiseFilterSupported }) => isKrispNoiseFilterSupported())
      .catch(() => false);
  }
  return krispSupportCache;
}

// O call força o microfone escolhido com `{ exact }` — é o que o
// switchActiveDevice do LiveKit faz por baixo. Passar o id solto vira uma
// constraint "ideal", que o navegador pode ignorar e devolver OUTRO microfone,
// fazendo a captura divergir do dispositivo configurado nas opções de som.
export function audioDeviceConstraint(deviceId: string | undefined): ConstrainDOMString | undefined {
  return deviceId ? { exact: deviceId } : undefined;
}

/**
 * O `{ exact }` derruba o getUserMedia (OverconstrainedError) quando o
 * dispositivo exigido não existe mais, e o restart do LiveKit para a track
 * antiga ANTES de tentar readquirir — deixar o erro subir deixaria o usuário
 * mudo no canal. Readquire no padrão do sistema nesse caso.
 */
async function restartTrackWithDeviceFallback(track: LocalAudioTrack, options: AudioCaptureOptions): Promise<void> {
  try {
    await track.restartTrack(options);
  } catch (error) {
    if (!options.deviceId) throw error;
    // `{ ideal: 'default' }` e não `undefined`: com deviceId vazio o restart do
    // LiveKit readquire com `audio: true` e perde as outras constraints.
    await track.restartTrack({ ...options, deviceId: { ideal: 'default' } });
  }
}

// Com deviceId vazio ("padrão do sistema"), o restartTrack do LiveKit ignora
// as constraints extras (echoCancellation/noiseSuppression/autoGainControl) e
// readquire a track sem elas — precisa do deviceId real da track ativa, não
// só o que o usuário escolheu explicitamente (que pode estar vazio).
export async function applyNoiseSuppressionMode(
  track: LocalAudioTrack,
  mode: NoiseSuppressionMode,
  preferredDeviceId?: string
): Promise<boolean> {
  // getSourceTrackSettings (e não mediaStreamTrack.getSettings) porque com o
  // Krisp ativo a track exposta é a processada, que sai de um nó de áudio e
  // não carrega deviceId nenhum — o fallback viraria "padrão do sistema".
  const deviceId = audioDeviceConstraint(preferredDeviceId || track.getSourceTrackSettings().deviceId);

  if (mode === 'krisp') {
    const supported = await isKrispSupported();
    if (!supported) return false;
    const { KrispNoiseFilter } = await import('@livekit/krisp-noise-filter');
    // Desliga a supressão nativa do WebRTC: rodar os dois juntos é
    // processamento redundante em cascata (ver docs.livekit.io/transport/media/noise-cancellation).
    await restartTrackWithDeviceFallback(track, {
      deviceId,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: false,
    });
    const processor = KrispNoiseFilter();
    await track.setProcessor(processor);
    await processor.setEnabled(true);
    return true;
  }

  if (track.getProcessor()) await track.stopProcessor();
  await restartTrackWithDeviceFallback(track, {
    deviceId,
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: true,
  });
  return true;
}
