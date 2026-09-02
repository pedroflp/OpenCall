import { getSoundEffectsVolume } from '@/lib/rtc/preferences';

const SOUND_URLS = {
  join: '/assets/sounds/channel_join.mp3',
  disconnect: '/assets/sounds/channel_left.mp3',
  mute: '/assets/sounds/mute.mp3',
  unmute: '/assets/sounds/unmute.mp3',
  deaf: '/assets/sounds/deaf.mp3',
  undeaf: '/assets/sounds/undeaf.mp3',
  inlive: '/assets/sounds/live-start.mp3',
  offlive: '/assets/sounds/live-exit.mp3',
  joinlive: '/assets/sounds/live-join.mp3',
  attention: '/assets/sounds/attention.wav',
  call: '/assets/sounds/call.wav',
} as const;

export type SoundName = keyof typeof SOUND_URLS;

// Teto de volume do app pros efeitos — a preferência do usuário (0 a 1) escala dentro desse teto.
const SOUND_VOLUME_CEILING = 0.6;

// O som de "chamar atenção" precisa furar o ensurdecido de quem é o alvo, então
// não passa pelo slider de efeitos sonoros — é fixo em 50% do volume original.
const ATTENTION_VOLUME = 0.5;

export { getSoundEffectsVolume, setSoundEffectsVolume } from '@/lib/rtc/preferences';

// Dispositivo de saída escolhido em "Saída de áudio" (ver AudioDeviceSelects) —
// espelhado aqui pelo VoiceProvider porque esses efeitos tocam via `new Audio()`
// solto, fora do Room do LiveKit, então não herdam o switchActiveDevice dele.
let outputDeviceId: string | null = null;

export function setSoundOutputDevice(deviceId: string | null) {
  outputDeviceId = deviceId;
}

function applyOutputDevice(audio: HTMLAudioElement) {
  if (!outputDeviceId) return;
  const sinkCapable = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sinkCapable.setSinkId === 'function') void sinkCapable.setSinkId(outputDeviceId).catch(() => {});
}

export function playSound(name: SoundName) {
  if (typeof window === 'undefined') return;
  const volume = getSoundEffectsVolume() * SOUND_VOLUME_CEILING;
  if (volume <= 0) return;
  const audio = new Audio(SOUND_URLS[name]);
  audio.volume = volume;
  applyOutputDevice(audio);
  void audio.play().catch(() => {});
}

let attentionAudio: HTMLAudioElement | null = null;
let attentionEndCallback: (() => void) | null = null;
let attentionPlaying = false;

// Fallback pra quando ainda não deu tempo de carregar os metadados do arquivo
// (praticamente nunca — ver preload logo abaixo), ou em navegadores que não
// reportam duration. Perto da duração real do attention.wav (~1.1s).
const DEFAULT_ATTENTION_DURATION_MS = 1500;
let attentionDurationMs = DEFAULT_ATTENTION_DURATION_MS;

// Preload silencioso só pra ler `duration` de metadados — não temos que
// esperar isso resolver: o valor é lido no primeiro "chamar atenção" de
// verdade, que nunca acontece nos primeiros milissegundos da sessão.
if (typeof window !== 'undefined') {
  const probe = new Audio(SOUND_URLS.attention);
  probe.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(probe.duration)) attentionDurationMs = probe.duration * 1000;
    },
    { once: true }
  );
}

/** Duração real do som do sino — usada pra manter a animação do sino tocando até o áudio acabar de verdade. */
export function getAttentionSoundDurationMs(): number {
  return attentionDurationMs;
}

/** `onEnded` dispara tanto quando o áudio termina naturalmente quanto quando é interrompido via stopAttentionSound. */
export function playAttentionSound(onEnded?: () => void) {
  if (typeof window === 'undefined') return;
  stopAttentionSound();
  const audio = new Audio(SOUND_URLS.attention);
  audio.volume = ATTENTION_VOLUME;
  applyOutputDevice(audio);
  attentionAudio = audio;
  attentionEndCallback = onEnded ?? null;
  audio.addEventListener('ended', () => {
    if (attentionAudio !== audio) return;
    attentionAudio = null;
    attentionPlaying = false;
    attentionEndCallback = null;
    onEnded?.();
  });
  audio
    .play()
    .then(() => {
      if (attentionAudio === audio) attentionPlaying = true;
    })
    .catch(() => {});
}

/** Toca de verdade agora (não bloqueado por autoplay policy) — usado pra saber se um clique em "Ativar áudio" deve tocar ou parar o som. */
export function isAttentionSoundPlaying(): boolean {
  return attentionPlaying;
}

export function stopAttentionSound() {
  if (!attentionAudio) return;
  attentionAudio.pause();
  attentionAudio.currentTime = 0;
  attentionAudio = null;
  attentionPlaying = false;
  const callback = attentionEndCallback;
  attentionEndCallback = null;
  callback?.();
}

let callAudio: HTMLAudioElement | null = null;

/** Toca em loop até stopCallSound (aceitar/recusar/expirar) — quem recebe a ligação decide quando ele para, não o navegador. */
export function playCallSound() {
  if (typeof window === 'undefined') return;
  stopCallSound();
  const volume = getSoundEffectsVolume() * SOUND_VOLUME_CEILING;
  if (volume <= 0) return;
  const audio = new Audio(SOUND_URLS.call);
  audio.loop = true;
  audio.volume = volume;
  applyOutputDevice(audio);
  callAudio = audio;
  void audio.play().catch(() => {});
}

export function stopCallSound() {
  if (!callAudio) return;
  callAudio.pause();
  callAudio.currentTime = 0;
  callAudio = null;
}
