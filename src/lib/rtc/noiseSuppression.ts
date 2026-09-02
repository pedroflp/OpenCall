import { Track, type AudioCaptureOptions, type AudioProcessorOptions, type LocalAudioTrack, type TrackProcessor } from 'livekit-client';

const GATE_STORAGE_KEY = 'opencall:voice:noise-gate-threshold-db';

// Faixa do slider de sensibilidade: -70dB deixa o gate quase sempre aberto
// (equivalente a "desligado" na prática), -20dB só abre com voz bem forte.
export const NOISE_GATE_MIN_DB = -70;
export const NOISE_GATE_MAX_DB = -20;
export const DEFAULT_NOISE_GATE_THRESHOLD_DB = -45;

export function loadNoiseGateThreshold(): number {
  if (typeof window === 'undefined') return DEFAULT_NOISE_GATE_THRESHOLD_DB;
  const stored = Number(localStorage.getItem(GATE_STORAGE_KEY));
  if (!Number.isFinite(stored) || stored < NOISE_GATE_MIN_DB || stored > NOISE_GATE_MAX_DB) {
    return DEFAULT_NOISE_GATE_THRESHOLD_DB;
  }
  return stored;
}

export function saveNoiseGateThreshold(thresholdDb: number): void {
  localStorage.setItem(GATE_STORAGE_KEY, String(thresholdDb));
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

const GATE_PROCESSOR_NAME = 'opencall-noise-gate';
const workletLoaded = new WeakSet<AudioContext>();

// Corpo do AudioWorkletProcessor: roda num escopo isolado (sem acesso ao
// bundle da app), por isso vai como string pra um Blob em vez de um arquivo
// importado. Decide bloco a bloco (128 amostras) se a saída fica em silêncio
// ou não, com histerese (evita "chacoalhar" perto do limiar) e um hold antes
// de fechar (evita cortar o fim de uma palavra) — envelope de ganho suavizado
// amostra a amostra pra não estalar na transição.
const GATE_WORKLET_SOURCE = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdDb = ${DEFAULT_NOISE_GATE_THRESHOLD_DB};
    this.gain = 0;
    this.gateOpen = false;
    this.holdRemaining = 0;
    this.holdSamples = Math.round(sampleRate * 0.15);
    this.hysteresisDb = 6;
    this.attackCoeff = Math.exp(-1 / (sampleRate * 0.005));
    this.releaseCoeff = Math.exp(-1 / (sampleRate * 0.15));
    this.gainRamp = new Float32Array(128);
    // Segunda porta, independente do gate de ruído: fechada, a saída vai a zero
    // mesmo com o gate aberto, e a captura continua rodando por baixo. No
    // OpenCall ela fica sempre aberta — a costura existe pro push to talk do
    // OpenCall+, que é onde escutar tecla sem foco de janela é possível (ver
    // §6 de docs/rfc-migracao-tdc.md).
    this.pttOpen = true;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (typeof data.thresholdDb === 'number') this.thresholdDb = data.thresholdDb;
      if (typeof data.pttOpen === 'boolean') this.pttOpen = data.pttOpen;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const channelCount = input.length;
    const frameCount = input[0].length;

    let sumSquares = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      const data = input[ch];
      for (let i = 0; i < frameCount; i++) sumSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSquares / (channelCount * frameCount || 1));
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;

    const openThreshold = this.thresholdDb;
    const closeThreshold = this.thresholdDb - this.hysteresisDb;

    if (this.gateOpen) {
      if (db > closeThreshold) {
        this.holdRemaining = this.holdSamples;
      } else if (this.holdRemaining > 0) {
        this.holdRemaining -= frameCount;
      } else {
        this.gateOpen = false;
      }
    } else if (db > openThreshold) {
      this.gateOpen = true;
      this.holdRemaining = this.holdSamples;
    }

    const targetGain = this.gateOpen && this.pttOpen ? 1 : 0;
    const coeff = targetGain > this.gain ? this.attackCoeff : this.releaseCoeff;
    let gain = this.gain;
    for (let i = 0; i < frameCount; i++) {
      gain = targetGain + (gain - targetGain) * coeff;
      this.gainRamp[i] = gain;
    }
    this.gain = gain;

    for (let ch = 0; ch < channelCount; ch++) {
      const inData = input[ch];
      const outData = output[ch];
      for (let i = 0; i < frameCount; i++) outData[i] = inData[i] * this.gainRamp[i];
    }
    return true;
  }
}
registerProcessor('${GATE_PROCESSOR_NAME}', NoiseGateProcessor);
`;

async function ensureGateWorkletLoaded(audioContext: AudioContext): Promise<void> {
  if (workletLoaded.has(audioContext)) return;
  const blobUrl = URL.createObjectURL(new Blob([GATE_WORKLET_SOURCE], { type: 'application/javascript' }));
  try {
    await audioContext.audioWorklet.addModule(blobUrl);
    workletLoaded.add(audioContext);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// TrackProcessor customizado (mesma interface do track-processors-js, que era
// https://github.com/livekit/track-processors-js) — um gate de ruído
// estilo Discord: abaixo do limiar a saída vai a zero, em vez de só atenuar
// como o noiseSuppression nativo do navegador (que preserva respiração/
// batidinha no mic por ser um denoiser espectral, não um corte).
class NoiseGateTrackProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = GATE_PROCESSOR_NAME;
  processedTrack?: MediaStreamTrack;
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private destinationNode?: MediaStreamAudioDestinationNode;
  private audioContext?: AudioContext;
  private thresholdDb: number;
  private pttOpen: boolean;

  constructor(thresholdDb: number, pttOpen: boolean) {
    this.thresholdDb = thresholdDb;
    this.pttOpen = pttOpen;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    this.audioContext = opts.audioContext;
    await ensureGateWorkletLoaded(opts.audioContext);
    this.source = opts.audioContext.createMediaStreamSource(new MediaStream([opts.track]));
    this.node = new AudioWorkletNode(opts.audioContext, GATE_PROCESSOR_NAME);
    this.node.port.postMessage({ thresholdDb: this.thresholdDb, pttOpen: this.pttOpen });
    this.destinationNode = opts.audioContext.createMediaStreamDestination();
    this.source.connect(this.node).connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  /**
   * O LiveKit reinicia o processor SEM repassar o audioContext quando a track é
   * reaquisitada (`setMediaStreamTrack`, o caminho de todo `restartTrack` — é
   * o que o `switchActiveDevice` usa pra trocar de microfone). O tipo promete
   * `audioContext`, mas em runtime ele chega `undefined`: sem esse fallback pro
   * contexto do init, a troca de microfone estourava "Cannot read properties of
   * undefined (reading 'audioWorklet')" no meio do restart — e o erro subia
   * antes do `replaceTrack`, deixando o mic sem track processada (ou seja:
   * mudo) e o dispositivo sem trocar.
   */
  async restart(opts: AudioProcessorOptions): Promise<void> {
    const audioContext = (opts as Partial<AudioProcessorOptions>).audioContext ?? this.audioContext;
    if (!audioContext) throw new Error('Gate de ruído reiniciado sem AudioContext');
    await this.destroy();
    await this.init({ ...opts, audioContext });
  }

  async destroy(): Promise<void> {
    this.source?.disconnect();
    this.node?.disconnect();
    this.destinationNode?.disconnect();
    this.source = undefined;
    this.node = undefined;
    this.destinationNode = undefined;
  }

  setThreshold(thresholdDb: number): void {
    this.thresholdDb = thresholdDb;
    this.node?.port.postMessage({ thresholdDb });
  }

  setPushToTalkOpen(open: boolean): void {
    this.pttOpen = open;
    this.node?.port.postMessage({ pttOpen: open });
  }
}

export function createNoiseGateProcessor(
  thresholdDb: number,
  pttOpen = true
): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  return new NoiseGateTrackProcessor(thresholdDb, pttOpen);
}

/**
 * Reaquire a track com a supressão nativa do navegador (echo/AGC/ruído — sempre
 * ligada, é a base) e prende o gate de ruído por cima. Chamado a cada
 * (re)publicação do mic e troca de dispositivo — `getSourceTrackSettings`
 * (e não `mediaStreamTrack.getSettings`) porque com o gate ativo a track
 * exposta é a processada, que sai do AudioWorklet e não carrega deviceId.
 */
export async function applyMicProcessing(
  track: LocalAudioTrack,
  thresholdDb: number,
  preferredDeviceId?: string,
  pttOpen = true
): Promise<void> {
  const deviceId = audioDeviceConstraint(preferredDeviceId || track.getSourceTrackSettings().deviceId);
  if (track.getProcessor()) await track.stopProcessor();
  await restartTrackWithDeviceFallback(track, {
    deviceId,
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: true,
  });
  await track.setProcessor(createNoiseGateProcessor(thresholdDb, pttOpen));
}

/**
 * Atualiza o limiar do gate já em execução sem reaquisitar o mic — usado
 * enquanto o usuário arrasta o slider de sensibilidade, pra não cortar o
 * áudio no meio da chamada. Sem processor ativo (ex: track ainda
 * reaquisitando), a próxima `applyMicProcessing` já sai com o valor atual.
 */
export function updateNoiseGateThreshold(track: LocalAudioTrack, thresholdDb: number): void {
  const processor = track.getProcessor();
  if (processor instanceof NoiseGateTrackProcessor) processor.setThreshold(thresholdDb);
}

