const AUDIO_INPUT_STORAGE_KEY = 'opencall:voice:audio-input-device';
const AUDIO_OUTPUT_STORAGE_KEY = 'opencall:voice:audio-output-device';
const VIDEO_INPUT_STORAGE_KEY = 'opencall:voice:video-input-device';

export function loadAudioInputDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(AUDIO_INPUT_STORAGE_KEY) ?? '';
}

export function saveAudioInputDeviceId(deviceId: string) {
  localStorage.setItem(AUDIO_INPUT_STORAGE_KEY, deviceId);
}

export function loadAudioOutputDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY) ?? '';
}

export function saveAudioOutputDeviceId(deviceId: string) {
  localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
}

/**
 * O dispositivo escolhido é exigido com `{ exact }` (ver audioDeviceConstraint) pra
 * o navegador não devolver outro no lugar. O custo disso é que um id salvo
 * apontando pra um dispositivo que sumiu (fone desconectado desde a última
 * sessão) faz o getUserMedia falhar — e aí não seria só o microfone errado, a
 * entrada no canal inteira cairia. Confere que ele ainda existe antes de exigi-lo.
 *
 * O enumerateDevices só revela os deviceIds depois que a permissão de
 * microfone/câmera foi concedida NESTA sessão de página: antes disso ele
 * devolve a lista anonimizada, com todos os ids vazios. Tratar essa lista como
 * verdade fazia o id salvo "não existir mais" e a escolha do usuário cair
 * calada no padrão do sistema — era isso que fazia entrar no canal capturando o
 * microfone da webcam com o de mesa selecionado no select. Só descarta a
 * escolha quando a lista é confiável (dá pra ver ao menos um id daquele tipo);
 * quando não é, mantém e deixa o fallback do getUserMedia decidir.
 */
async function resolveDeviceId(kind: MediaDeviceKind, deviceId: string): Promise<string> {
  if (!deviceId || typeof navigator === 'undefined') return '';

  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === kind);
    if (devices.some((device) => device.deviceId === deviceId)) return deviceId;
    return devices.some((device) => device.deviceId) ? '' : deviceId;
  } catch {
    // Sem conseguir enumerar não dá pra provar que sumiu — mantém a escolha.
    return deviceId;
  }
}

export function resolveAudioInputDeviceId(deviceId: string): Promise<string> {
  return resolveDeviceId('audioinput', deviceId);
}

export function loadVideoInputDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(VIDEO_INPUT_STORAGE_KEY) ?? '';
}

export function saveVideoInputDeviceId(deviceId: string) {
  localStorage.setItem(VIDEO_INPUT_STORAGE_KEY, deviceId);
}

/** Mesma lógica de resolveAudioInputDeviceId, para o dispositivo de câmera. */
export function resolveVideoInputDeviceId(deviceId: string): Promise<string> {
  return resolveDeviceId('videoinput', deviceId);
}
