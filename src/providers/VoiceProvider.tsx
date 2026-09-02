'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioPresets,
  ConnectionState,
  Room,
  RoomEvent,
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
  supportsVP9,
  type AudioCaptureOptions,
  type RemoteParticipant,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from 'livekit-client';
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import type { RtcConfig } from '@/lib/rtc/channels';
import { decodeRtcConfig } from '@/lib/rtc/roomMetadata';
import {
  loadAudioInputDeviceId,
  loadAudioOutputDeviceId,
  loadVideoInputDeviceId,
  resolveAudioInputDeviceId,
  resolveVideoInputDeviceId,
  saveAudioInputDeviceId,
  saveAudioOutputDeviceId,
  saveVideoInputDeviceId,
} from '@/lib/rtc/devices';
import {
  applyMicProcessing,
  audioDeviceConstraint,
  DEFAULT_NOISE_GATE_THRESHOLD_DB,
  loadNoiseGateThreshold,
  saveNoiseGateThreshold,
  updateNoiseGateThreshold,
} from '@/lib/rtc/noiseSuppression';
import { CAMERA_CAPTURE_OPTIONS, CAMERA_PUBLISH_OPTIONS, videoDeviceConstraint } from '@/lib/rtc/cameraQuality';
import {
  DEFAULT_PARTICIPANT_VOLUME,
  MAX_PARTICIPANT_VOLUME,
  loadChannelPreferences,
  saveMutedParticipant,
  saveParticipantVolume,
} from '@/lib/rtc/preferences';
import { useToast } from '@/components/ui/use-toast';
import {
  getAttentionSoundDurationMs,
  isAttentionSoundPlaying,
  playAttentionSound,
  playSound,
  setSoundOutputDevice,
  stopAttentionSound,
} from '@/lib/sound';
import { refreshChannelPresence } from '@/hooks/useChannelPresence';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import { avatarFromParticipant, participantDisplayName } from '@/lib/rtc/participant';
import CallScreenDim from '@/components/CallScreenDim';
import FloatingCameraBubble from '@/components/VoiceDock/FloatingCameraBubble';
import MobileStreamView from '@/components/VoiceDock/MobileStreamView';

type VoiceStatus = 'idle' | 'connecting' | 'connected';

const SCREEN_SHARE_IDLE_TIMEOUT_MS = 3 * 60_000;
const SCREEN_SHARE_STATS_DEBUG = process.env.NODE_ENV !== 'production';
const SCREEN_SHARE_STATS_INTERVAL_MS = 10_000;
/** "Chamar atenção" num participante ensurdecido — mesmo intervalo pro mesmo alvo. */
const ATTENTION_COOLDOWN_MS = 30_000;

// Mic/deafen/enter-stream nunca passam pelo nosso servidor — vão direto pro
// LiveKit self-hosted via signaling do client SDK (setMicrophoneEnabled,
// setAttributes, subscribe de track). Rate limit em cima do join/leave (ver
// api/rtc/join e api/rtc/leave) não enxerga essas chamadas, então o guard tem
// que ficar aqui, no único chokepoint por onde toda a UI passa. leaveStream
// fica de fora de propósito: é a metade barata (unsubscribe) e é chamado
// automaticamente (efeito em VoiceChannelStage quando a track some), então
// limitá-lo arriscaria travar esse cleanup automático.
const TOGGLE_RATE_LIMIT = { windowMs: 8_000, max: 6 };
const SCREEN_SHARE_RATE_LIMIT = { windowMs: 15_000, max: 4 };
const CAMERA_RATE_LIMIT = { windowMs: 15_000, max: 4 };
const ENTER_STREAM_RATE_LIMIT = { windowMs: 10_000, max: 8 };

// Capturar "áudio do sistema" grava o mix de saída inteiro — inclusive a própria
// aba do app tocando a voz dos outros, que voltava pra eles como eco. Não é eco
// acústico: o loopback é digital, então fone de ouvido não resolve, e
// echoCancellation também não, porque só se aplica a track de microfone.
// restrictOwnAudio (Chrome/Edge 140+) filtra do mix justamente o áudio originado
// do documento que chamou getDisplayMedia, que é exatamente o nosso caso.
function supportsRestrictOwnAudio() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getSupportedConstraints) return false;
  return 'restrictOwnAudio' in navigator.mediaDevices.getSupportedConstraints();
}

// Também passadas por publicação (não só no publishDefaults do Room, que é
// congelado na conexão): é isso que faz uma live aberta depois de o admin mudar
// a qualidade já sair na config nova, sem precisar reconectar.
function screenSharePublishOptions(config: RtcConfig): TrackPublishOptions {
  return {
    dtx: config.dtx,
    // VP9 (SVC) não tem suporte confiável de encode em todo navegador (Safari,
    // notadamente). Cai para VP8 no publisher em vez de deixar a transmissão
    // simplesmente não iniciar.
    videoCodec: config.screenShareCodec === 'vp9' && !supportsVP9() ? 'vp8' : config.screenShareCodec,
    // O padrão do LiveKit para screen share é 'maintain-resolution', calibrado
    // pra texto/UI — sob congestionamento ele derruba frames pra preservar
    // nitidez, que é a causa clássica do stuttering em cena de movimento. Qual
    // dos dois é o certo depende do que está sendo transmitido, por isso vem do
    // painel. O SDK aplica no sender assim que ele é criado.
    degradationPreference: config.screenShareDegradationPreference,
    screenShareEncoding: {
      maxBitrate: config.screenShareMaxBitrate,
      maxFramerate: config.screenShareMaxFramerate,
    },
    screenShareSimulcastLayers: [],
  };
}

// ScreenShareAudio (áudio do sistema/jogo capturado junto da tela, ver
// [[rtc-screenshare-audio-subscription]]) herdava, via screenSharePublishOptions,
// os defaults calibrados pra voz: dtx: true corta trechos de volume baixo como
// se fosse pausa de fala — em música/jogo isso é conteúdo, não silêncio — e sem
// audioPreset o SDK publica sem teto de bitrate definido por nós (fallback pro
// default do navegador, historicamente bem abaixo do que o Opus suporta). Ao
// contrário do vídeo, o custo de banda de áudio é desprezível (128kbps vs até
// 5 Mbps de vídeo), então não há trade-off pra expor no admin — fica fixo.
function screenShareAudioPublishOptions(): TrackPublishOptions {
  return {
    audioPreset: AudioPresets.musicHighQualityStereo,
    dtx: false,
    red: true,
  };
}

// Live já em andamento quando o admin muda a qualidade. Best-effort de
// propósito: nada aqui pode derrubar uma transmissão no ar. restartTrack faria
// isso pelo caminho oficial do SDK, mas chama getDisplayMedia de novo — ou
// seja, popup de compartilhamento na cara de quem está streamando. Por isso
// mexe direto na origem (applyConstraints) e no sender.
async function applyConfigToLiveShare(room: Room, config: RtcConfig) {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
  if (!track) return;

  try {
    await track.mediaStreamTrack.applyConstraints({
      width: { ideal: config.screenShareWidth },
      height: { ideal: config.screenShareHeight },
      frameRate: { ideal: config.screenShareMaxFramerate },
    });
  } catch (error) {
    console.warn('[rtc] resolução não pôde ser reaplicada na live em andamento', error);
  }

  try {
    if (track instanceof LocalVideoTrack) {
      await track.setDegradationPreference(config.screenShareDegradationPreference);
    }

    const sender = track.sender;
    if (!sender) return;
    const parameters = sender.getParameters();
    parameters.encodings.forEach((encoding) => {
      encoding.maxBitrate = config.screenShareMaxBitrate;
      encoding.maxFramerate = config.screenShareMaxFramerate;
    });
    await sender.setParameters(parameters);
  } catch (error) {
    console.warn('[rtc] teto de bitrate não pôde ser reaplicado na live em andamento', error);
  }
}

// A constraint é best-effort: `restrictOwnAudio: true` no getSettings() confirma
// que o filtro pegou. Vem false/undefined quando a superfície compartilhada não
// tem áudio de sistema (compartilhar uma aba), aí não há o que filtrar. Fica sem
// gate de NODE_ENV porque o teste do eco acontece com usuários reais, em
// produção — é uma linha por início de transmissão.
function reportScreenShareAudio(room: Room, restrictOwnAudio: boolean) {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track;
  // eslint-disable-next-line no-console
  console.info('[rtc] screen share audio', {
    supported: restrictOwnAudio,
    published: Boolean(track),
    settings: track?.mediaStreamTrack.getSettings(),
  });
}

interface JoinedChannel {
  id: string;
  name: string;
}

interface IncomingAttention {
  identity: string;
  name: string;
  avatar?: string;
}

interface JoinResponse {
  token: string;
  url: string;
  channel: JoinedChannel;
  config: RtcConfig;
}

interface VoiceContextValue {
  status: VoiceStatus;
  channel: JoinedChannel | null;
  micEnabled: boolean;
  deafened: boolean;
  serverMuted: boolean;
  screenSharing: boolean;
  screenShareCountdown: number | null;
  watching: string | null;
  streamQuality: RtcConfig | null;
  cameraEnabled: boolean;
  videoFacingMode: 'user' | 'environment' | null;
  join: (channelId: string, watchIdentity?: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
  enterStream: (identity: string) => Promise<void>;
  leaveStream: () => Promise<void>;
  disconnectParticipant: (channelId: string, identity: string) => Promise<void>;
  removeSpectator: (identity: string) => Promise<void>;
  stopStream: (identity: string) => Promise<void>;
  stopCamera: (identity: string) => Promise<void>;
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  setInputDeviceId: (deviceId: string) => Promise<void>;
  setOutputDeviceId: (deviceId: string) => Promise<void>;
  setVideoDeviceId: (deviceId: string) => Promise<void>;
  /** Limiar do gate de ruído em dB (ver lib/rtc/noiseSuppression) — quanto maior, mais forte a voz precisa ser pra abrir. */
  noiseGateThreshold: number;
  setNoiseGateThreshold: (thresholdDb: number) => void;
  getParticipantVolume: (identity: string) => number;
  setParticipantVolume: (identity: string, volume: number) => void;
  isParticipantMuted: (identity: string) => boolean;
  toggleParticipantMute: (identity: string) => void;
  getStreamVolume: (identity: string) => number;
  setStreamVolume: (identity: string, volume: number) => void;
  isServerMuted: (identity: string) => boolean;
  toggleServerMute: (identity: string) => Promise<void>;
  callAttention: (identity: string) => void;
  getAttentionCooldown: (identity: string) => number;
  isCallingAttention: (identity: string) => boolean;
  incomingAttention: IncomingAttention | null;
  toggleAttentionAudio: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice precisa estar dentro de VoiceProvider');
  return ctx;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Entre na sua conta para usar a voz.',
  CHANNEL_NOT_FOUND: 'Esse canal não existe.',
  CHANNEL_FULL: 'O canal está cheio.',
  TOO_MANY_JOINS: 'Muitas tentativas seguidas. Espere um pouco.',
  SERVICE_DISABLED: 'OpenCall está temporariamente desativado.',
};

// Só a track de tela (e o eventual áudio de sistema/aba publicado junto) do
// usuário assistido de fato deve ser recebida — as demais ficam publicadas
// mas sem subscription, então nenhuma outra live consome banda/decodificação
// nem, principalmente, vaza áudio pra sala inteira até alguém clicar para
// entrar nela (ScreenShareAudio teria autoSubscribe: true por padrão do SDK
// se não fosse explicitamente barrado aqui).
// getSettings().facingMode só existe em câmeras de dispositivos móveis (a
// forma que o navegador tem de dizer "essa é a frontal"/"essa é a traseira")
// — webcams comuns de notebook/desktop não reportam nada aqui. Usado tanto
// pra saber o lado atual quanto, indiretamente, se faz sentido oferecer o
// botão de virar (ver docs/rfc-camera.md).
function readCameraFacingMode(room: Room): 'user' | 'environment' | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  if (!(track instanceof LocalVideoTrack) || track.isMuted) return null;
  const facingMode = track.mediaStreamTrack.getSettings().facingMode;
  return facingMode === 'user' || facingMode === 'environment' ? facingMode : null;
}

/**
 * Dispositivo que o microfone publicado está de fato capturando — a track
 * exposta pode ser a processada pelo gate, que sai de um nó de áudio e não
 * carrega deviceId nenhum, daí o getSourceTrackSettings (ver noiseSuppression).
 */
function readMicSource(room: Room): { deviceId: string; label: string } | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  if (!(track instanceof LocalAudioTrack)) return null;
  return { deviceId: track.getSourceTrackSettings().deviceId ?? '', label: track.mediaStreamTrack.label };
}

function setScreenShareSubscribed(participant: RemoteParticipant | undefined, subscribed: boolean) {
  participant?.trackPublications.forEach((publication) => {
    if (publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio) {
      publication.setSubscribed(subscribed);
    }
  });
}

// Corta o tráfego de mic de todo mundo pra quem ensurdeceu: sem isso o SFU
// continua encaminhando áudio normalmente e só o <RoomAudioRenderer muted>
// impedia a reprodução — ou seja, o dado chegava e era descartado depois de
// decodificado. O efeito escala: se todo mundo no canal ensurdecer, ninguém
// mais recebe mic de ninguém. Isolado do attribute `deafened` (broadcast via
// setAttributes, ver toggleDeafen) de propósito — presença/ícone de
// ensurdecido continua batendo pra quem tá fora do canal só olhando a UI,
// independente do estado de subscription.
function setRemoteMicSubscribed(room: Room, subscribed: boolean) {
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.source === Track.Source.Microphone) publication.setSubscribed(subscribed);
    });
  });
}

// Best-effort: força o participante pra fora do canal no servidor LiveKit
// (ver /api/rtc/leave) em vez de só desconectar o client. Sem isso, quem troca
// de canal ou sai continua listado no canal anterior até o departureTimeout
// expirar, porque o servidor trata o disconnect como uma possível queda de
// rede reconectável em vez de uma saída intencional. Ao concluir, a rota já
// invalida o cache de presença do canal — só falta forçar o próprio cliente a
// buscar de novo, senão a UI local fica com o snapshot antigo até o próximo
// tick do poll (até 10s+).
function forceLeaveChannel(channelId: string): void {
  fetch('/api/rtc/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId }),
  })
    .catch(() => {})
    .finally(() => refreshChannelPresence(channelId));
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [channel, setChannel] = useState<JoinedChannel | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [serverMuted, setServerMuted] = useState(false);
  const [serverMutedParticipants, setServerMutedParticipants] = useState<Record<string, boolean>>({});
  const [attentionCooldownUntil, setAttentionCooldownUntil] = useState<Record<string, number>>({});
  const [attentionFlashes, setAttentionFlashes] = useState<Record<string, boolean>>({});
  const attentionFlashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [incomingAttention, setIncomingAttention] = useState<IncomingAttention | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [videoFacingMode, setVideoFacingMode] = useState<'user' | 'environment' | null>(null);
  const [screenShareCountdown, setScreenShareCountdown] = useState<number | null>(null);
  const [hasViewer, setHasViewer] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [inputDeviceId, setInputDeviceIdState] = useState('');
  const [outputDeviceId, setOutputDeviceIdState] = useState('');
  const [videoDeviceId, setVideoDeviceIdState] = useState('');
  const [noiseGateThreshold, setNoiseGateThresholdState] = useState<number>(DEFAULT_NOISE_GATE_THRESHOLD_DB);
  // O listener de LocalTrackPublished é registrado uma vez por Room (dentro de
  // join()) e reaplica o gate a cada republicação do mic — precisa ler o valor
  // atual, não o capturado no closure de quando a room foi criada. Mesma coisa
  // pro microfone escolhido, que o listener usa pra reaquisitar a track.
  const noiseGateThresholdRef = useRef<number>(DEFAULT_NOISE_GATE_THRESHOLD_DB);
  const inputDeviceIdRef = useRef('');
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [mutedParticipants, setMutedParticipants] = useState<Record<string, boolean>>({});
  // Volume da ÁUDIO DA TRANSMISSÃO (Track.Source.ScreenShareAudio) de cada
  // participante, deliberadamente separado de participantVolumes (que é o
  // volume do MICROFONE dele no canal de voz) — são tracks diferentes.
  const [streamVolumes, setStreamVolumes] = useState<Record<string, number>>({});
  const joining = useRef(false);
  const initialConnectDone = useRef(false);
  const micEnabledBeforeDeafen = useRef(false);
  const remoteWatchingRef = useRef<Map<string, string>>(new Map());
  const watchingRef = useRef<string | null>(null);
  const deafenedRef = useRef(false);
  const configRef = useRef<RtcConfig | null>(null);
  // Espelha configRef em state: a ref não re-renderiza a UI quando o admin muda
  // a qualidade via RoomMetadataChanged, e é exatamente esse label que a stage
  // exibe (resolução/fps vindos do banco, ver channelsConfig).
  const [streamQuality, setStreamQuality] = useState<RtcConfig | null>(null);
  const { toast } = useToast();

  const guardRateLimit = useCallback(
    (key: string, limit: { windowMs: number; max: number }) => {
      if (checkRateLimit(key, limit).allowed) return true;
      toast({
        variant: 'destructive',
        title: 'Devagar aí',
        description: 'Muitas ações seguidas — espere um instante.',
      });
      return false;
    },
    [toast]
  );

  useEffect(() => {
    const storedInputDeviceId = loadAudioInputDeviceId();
    inputDeviceIdRef.current = storedInputDeviceId;
    setInputDeviceIdState(storedInputDeviceId);
    setOutputDeviceIdState(loadAudioOutputDeviceId());
    setVideoDeviceIdState(loadVideoInputDeviceId());
    const storedThreshold = loadNoiseGateThreshold();
    noiseGateThresholdRef.current = storedThreshold;
    setNoiseGateThresholdState(storedThreshold);
  }, []);

  // Efeitos sonoros (join/mute/attention/inlive...) tocam via `new Audio()` solto,
  // fora do Room do LiveKit — precisam saber manualmente qual saída está selecionada
  // pra não ficarem presos no dispositivo padrão do sistema (ver lib/sound.ts).
  useEffect(() => {
    setSoundOutputDevice(outputDeviceId || null);
  }, [outputDeviceId]);

  const reset = useCallback(() => {
    initialConnectDone.current = false;
    setRoom(null);
    setStatus('idle');
    setChannel(null);
    setMicEnabled(false);
    setDeafened(false);
    deafenedRef.current = false;
    stopAttentionSound();
    setServerMuted(false);
    setServerMutedParticipants({});
    setAttentionFlashes({});
    setIncomingAttention(null);
    attentionFlashTimers.current.forEach((timer) => clearTimeout(timer));
    attentionFlashTimers.current.clear();
    setScreenSharing(false);
    setCameraEnabled(false);
    setVideoFacingMode(null);
    setWatching(null);
    setHasViewer(false);
    setStreamQuality(null);
    remoteWatchingRef.current.clear();
    watchingRef.current = null;
  }, []);

  const clearAttentionFlash = useCallback((identity: string) => {
    const timers = attentionFlashTimers.current;
    const existing = timers.get(identity);
    if (existing) clearTimeout(existing);
    timers.delete(identity);
    setAttentionFlashes((prev) => {
      if (!prev[identity]) return prev;
      const next = { ...prev };
      delete next[identity];
      return next;
    });
  }, []);

  // Flash do sino visível pra sala inteira (quem chamou e todo mundo que estava
  // olhando) — não mistura com o cooldown, que é só do lado de quem chama. Fica
  // "tocando" pelo tempo real do áudio (getAttentionSoundDurationMs): pra quem é
  // o alvo, o DataReceived abaixo também limpa via callback no fim de verdade do
  // áudio (playAttentionSound) — esse timeout aqui é só o fallback/aproximação
  // pra quem não está tocando o som (todo mundo mais na sala).
  const flashAttention = useCallback(
    (identity: string) => {
      setAttentionFlashes((prev) => ({ ...prev, [identity]: true }));
      const timers = attentionFlashTimers.current;
      const existing = timers.get(identity);
      if (existing) clearTimeout(existing);
      timers.set(
        identity,
        setTimeout(() => clearAttentionFlash(identity), getAttentionSoundDurationMs())
      );
    },
    [clearAttentionFlash]
  );

  // Definido antes de `join` de propósito: join() chama enterStream() direto (via
  // `next`, não via closure de `room`) pra entrar numa live já ao clicar em "AO
  // VIVO" fora do canal — precisa existir nas deps de join sem TDZ.
  const enterStream = useCallback(
    async (identity: string) => {
      if (!room) return;
      if (!guardRateLimit('enterStream', ENTER_STREAM_RATE_LIMIT)) return;

      // Só uma coisa por vez: assistir uma live enquanto transmite a própria
      // tela não faz sentido nesse app, então entrar como espectador encerra
      // a própria transmissão automaticamente (exceto ao "assistir a si
      // mesmo", que é o preview da própria live).
      if (identity !== room.localParticipant.identity && room.localParticipant.isScreenShareEnabled) {
        await room.localParticipant.setScreenShareEnabled(false);
        setScreenSharing(false);
      }

      const previous = watchingRef.current;
      if (previous && previous !== identity) {
        if (room.remoteParticipants.get(previous)?.isScreenShareEnabled) playSound('offlive');
        setScreenShareSubscribed(room.remoteParticipants.get(previous), false);
      }

      watchingRef.current = identity;
      setWatching(identity);
      setScreenShareSubscribed(room.remoteParticipants.get(identity), true);
      await room.localParticipant.setAttributes({ watching: identity });
    },
    [room, guardRateLimit]
  );

  const join = useCallback(
    async (channelId: string, watchIdentity?: string) => {
      if (joining.current) return;
      if (status === 'connected' && channel?.id === channelId) {
        // Já conectado nesse canal (ex: clicou "AO VIVO" de outra página) — só falta
        // entrar na stream, sem repassar pelo fluxo de conexão inteiro.
        if (watchIdentity) void enterStream(watchIdentity);
        return;
      }

      // Trocar de canal enquanto já conectado em outro (ex: navegar de
      // /channels/geral para /channels/primos) não é coberto pelo guard de
      // 'idle' abaixo — sai do canal atual antes de entrar no novo.
      const switchingChannel = status === 'connected' && channel !== null && channel.id !== channelId;
      if (status !== 'idle' && !switchingChannel) return;

      joining.current = true;
      setStatus('connecting');

      if (switchingChannel && channel) {
        // eslint-disable-next-line no-console
        console.trace(`[voice-debug] switchingChannel: leaving ${channel.id} to join ${channelId}`);
        await room?.disconnect();
        forceLeaveChannel(channel.id);
        setStatus('connecting');
      }

      try {
        const response = await fetch('/api/rtc/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId }),
        });

        if (!response.ok) {
          const { error } = await response.json().catch(() => ({ error: '' }));
          throw new Error(ERROR_MESSAGES[error] ?? 'Não foi possível entrar no canal.');
        }

        const { token, url, channel: joined, config } = (await response.json()) as JoinResponse;
        configRef.current = config;
        setStreamQuality(config);
        const preferences = await loadChannelPreferences();
        const storedVolumes = preferences.participantVolumes ?? {};
        const storedMuted = preferences.mutedParticipants ?? {};
        setParticipantVolumes(storedVolumes);
        setMutedParticipants(storedMuted);
        const effectiveVolume = (identity: string) =>
          storedMuted[identity] ? 0 : storedVolumes[identity];

        const activeInputDeviceId = await resolveAudioInputDeviceId(inputDeviceId);
        inputDeviceIdRef.current = activeInputDeviceId;
        const activeVideoDeviceId = await resolveVideoInputDeviceId(videoDeviceId);

        // VP9 (SVC) não tem suporte confiável de encode em todo navegador (Safari,
        // notadamente). Cai para VP8 no publisher em vez de deixar a transmissão
        // simplesmente não iniciar — o backupCodec do LiveKit (default: ligado)
        // cobre o caso simétrico de um espectador sem suporte a VP9.
        const next = new Room({
          adaptiveStream: true,
          dynacast: true,
          // Sem isso, RemoteAudioTrack.setVolume() cai no <audio>.volume nativo, que o
          // navegador satura em 1.0 — o slider de volume por participante não conseguiria
          // passar de 100% (ver ParticipantVolumeControl, faixa até 150%/ganho).
          webAudioMix: true,
          // A supressão nativa do navegador (echo/AGC/ruído) é a BASE e fica
          // sempre ligada; o gate de ruído entra por cima como processor, na
          // republicação (ver LocalTrackPublished abaixo).
          // deviceId como `{ exact }` (audioDeviceConstraint), não o id solto: solto
          // vira constraint "ideal", que o navegador pode ignorar — era isso que
          // fazia o canal capturar o microfone padrão do sistema mesmo com outro
          // escolhido nas configurações. É a mesma forma que o switchActiveDevice
          // do LiveKit usa quando a troca acontece com o canal já aberto.
          audioCaptureDefaults: {
            deviceId: audioDeviceConstraint(activeInputDeviceId),
            noiseSuppression: true,
          },
          audioOutput: outputDeviceId ? { deviceId: outputDeviceId } : undefined,
          videoCaptureDefaults: {
            ...CAMERA_CAPTURE_OPTIONS,
            deviceId: videoDeviceConstraint(activeVideoDeviceId),
          },
          publishDefaults: screenSharePublishOptions(config),
        });

        const recomputeHasViewer = () => {
          setHasViewer(
            Array.from(next.remoteParticipants.values()).some(
              (participant) => participant.attributes.watching === next.localParticipant.identity
            )
          );
        };

        next
          .on(RoomEvent.Disconnected, (reason) => {
            // eslint-disable-next-line no-console
            console.warn('[voice-debug] RoomEvent.Disconnected — reason:', reason);
            console.trace('[voice-debug] Disconnected stack');
            playSound('disconnect');
            reset();
          })
          .on(RoomEvent.RoomMetadataChanged, (metadata) => {
            // Admin mudou a qualidade da transmissão (ver /api/rtc/stream-config).
            // Vale pra quem ainda vai abrir uma live (configRef alimenta o
            // toggleScreenShare) e, best-effort, pra quem já está no ar.
            const updated = decodeRtcConfig(metadata);
            if (!updated) return;
            configRef.current = updated;
            setStreamQuality(updated);
            void applyConfigToLiveShare(next, updated);
          })
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            // eslint-disable-next-line no-console
            console.debug('[voice-debug] RoomEvent.ConnectionStateChanged —', state);
            // Só reage aqui a reconexões (quando o join inicial já terminou e
            // `room`/`channel` já estão setados). No connect inicial, esse
            // evento dispara antes de setMicrophoneEnabled/setRoom resolverem,
            // e deixar `status` virar "connected" nesse meio-tempo faz o
            // VoiceDock renderizar hooks do LiveKit sem RoomContext pronto.
            if (state === ConnectionState.Connected && initialConnectDone.current) setStatus('connected');
          })
          .on(RoomEvent.ParticipantConnected, (participant) => {
            playSound('join');
            const volume = effectiveVolume(participant.identity);
            if (volume !== undefined) participant.setVolume(volume);
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            playSound('disconnect');
            // Se quem desconectou estava assistindo a nossa transmissão, avisa
            // que a live perdeu esse espectador.
            if (
              next.localParticipant.isScreenShareEnabled &&
              remoteWatchingRef.current.get(participant.identity) === next.localParticipant.identity
            ) {
              playSound('offlive');
            }
            remoteWatchingRef.current.delete(participant.identity);
            recomputeHasViewer();
          })
          .on(RoomEvent.LocalTrackPublished, (publication) => {
            setMicEnabled(next.localParticipant.isMicrophoneEnabled);
            setScreenSharing(next.localParticipant.isScreenShareEnabled);
            setCameraEnabled(next.localParticipant.isCameraEnabled);
            setVideoFacingMode(readCameraFacingMode(next));
            if (publication.source === Track.Source.ScreenShare) playSound('inlive');
            // Cada vez que o mic (re)publica ele é uma MediaStreamTrack nova, sem o
            // processor/constraints da vez anterior — reaplica o gate de ruído.
            if (publication.source === Track.Source.Microphone && publication.track instanceof LocalAudioTrack) {
              void applyMicProcessing(publication.track, noiseGateThresholdRef.current, inputDeviceIdRef.current);
            }
          })
          .on(RoomEvent.LocalTrackUnpublished, (publication) => {
            setMicEnabled(next.localParticipant.isMicrophoneEnabled);
            setScreenSharing(next.localParticipant.isScreenShareEnabled);
            setCameraEnabled(next.localParticipant.isCameraEnabled);
            setVideoFacingMode(readCameraFacingMode(next));
            if (publication.source === Track.Source.ScreenShare) playSound('offlive');
          })
          .on(RoomEvent.TrackPublished, (publication, participant) => {
            // Mic publicado (ou republicado) enquanto estamos ensurdecidos —
            // mesma regra do toggleDeafen: nasce sem subscription, senão um
            // participante que entra ou reativa o mic depois de já estarmos
            // deaf volta a consumir banda sem a gente pedir.
            if (publication.source === Track.Source.Microphone) {
              if (deafenedRef.current) publication.setSubscribed(false);
              return;
            }

            if (publication.source === Track.Source.ScreenShare) {
              playSound('inlive');
            } else if (publication.source !== Track.Source.ScreenShareAudio) {
              return;
            }
            // A live (vídeo e o eventual áudio de sistema/aba publicado junto)
            // só deve chegar decodificando para quem clicar em "entrar" —
            // publicada por outro participante que não o assistido, fica
            // publicada mas sem subscription (sem consumir banda nem vazar
            // áudio pra sala inteira) até então.
            if (participant.identity !== watchingRef.current) publication.setSubscribed(false);
          })
          .on(RoomEvent.TrackUnpublished, (publication) => {
            if (publication.source === Track.Source.ScreenShare) playSound('offlive');
          })
          .on(RoomEvent.ParticipantAttributesChanged, (changedAttributes, participant) => {
            // Um admin encerrou a nossa transmissão à distância (via
            // /api/rtc/stop-stream) — desliga a tela compartilhada localmente
            // em vez de só ficar mudo, senão a captura continuaria rodando.
            if (
              'stopStream' in changedAttributes &&
              participant.identity === next.localParticipant.identity &&
              next.localParticipant.isScreenShareEnabled
            ) {
              void next.localParticipant.setScreenShareEnabled(false).then(() => {
                setScreenSharing(false);
                toast({
                  title: 'Transmissão encerrada',
                  description: 'Um administrador encerrou sua transmissão.',
                });
              });
            }

            // Um channels_admin desligou a nossa câmera à distância (via
            // /api/rtc/stop-camera) — mesmo esquema do stopStream acima.
            if (
              'stopCamera' in changedAttributes &&
              participant.identity === next.localParticipant.identity &&
              next.localParticipant.isCameraEnabled
            ) {
              void next.localParticipant.setCameraEnabled(false).then(() => {
                setCameraEnabled(false);
                setVideoFacingMode(null);
                toast({
                  title: 'Câmera desligada',
                  description: 'Um administrador de canais desligou sua câmera.',
                });
              });
            }

            // Um channels_admin (des)ativou o "mutar para todos" nesse
            // participante (via /api/rtc/mute) — todo mundo na sala vê o
            // attribute mudar, mas só o próprio dono força o microfone
            // localmente (mesmo motivo do stopStream acima: o servidor não
            // consegue silenciar de fato um track publicado pelo client).
            if ('serverMuted' in changedAttributes) {
              const isMuted = changedAttributes.serverMuted === '1';
              setServerMutedParticipants((prev) =>
                prev[participant.identity] === isMuted ? prev : { ...prev, [participant.identity]: isMuted }
              );

              if (participant.identity === next.localParticipant.identity) {
                setServerMuted(isMuted);
                if (isMuted && next.localParticipant.isMicrophoneEnabled) {
                  void next.localParticipant.setMicrophoneEnabled(false).then(() => setMicEnabled(false));
                  toast({
                    title: 'Microfone desativado',
                    description: 'Um administrador de canais te silenciou para todos.',
                  });
                }
              }
            }

            if (!('watching' in changedAttributes)) return;

            const previousWatching = remoteWatchingRef.current.get(participant.identity) ?? '';
            const nextWatching = changedAttributes.watching ?? '';

            // Esse attribute é nosso próprio "watching" mudando por fora (admin
            // removendo a gente como espectador via /api/rtc/unwatch) — sincroniza
            // o estado local (inclusive a subscription da track de tela), senão a
            // stage continua achando que ainda estamos assistindo até a gente sair
            // e voltar, e a track antiga segue consumindo banda.
            if (participant.identity === next.localParticipant.identity) {
              const nextValue = nextWatching || null;
              if (watchingRef.current && watchingRef.current !== nextValue) {
                setScreenShareSubscribed(next.remoteParticipants.get(watchingRef.current), false);
              }
              watchingRef.current = nextValue;
              setWatching(nextValue);
            }

            // Se esse participante passou a assistir a nossa transmissão,
            // avisa o transmissor que ganhou um espectador.
            if (
              previousWatching !== next.localParticipant.identity &&
              nextWatching === next.localParticipant.identity &&
              next.localParticipant.isScreenShareEnabled
            ) {
              playSound('joinlive');
            }

            // Se esse participante estava assistindo a nossa transmissão e
            // parou (trocou de transmissão ou saiu), avisa o transmissor.
            if (
              previousWatching === next.localParticipant.identity &&
              nextWatching !== next.localParticipant.identity &&
              next.localParticipant.isScreenShareEnabled
            ) {
              playSound('offlive');
            }
            remoteWatchingRef.current.set(participant.identity, nextWatching);

            recomputeHasViewer();
          })
          .on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
            // "Chamar atenção" num participante ensurdecido (ver ParticipantTile):
            // broadcast direto via LiveKit, sem passar pelo nosso servidor — o som
            // do sino só toca pra quem é o alvo, mas o flash visual é pra sala toda.
            if (topic !== 'attention') return;
            let message: { target?: unknown } | null = null;
            try {
              message = JSON.parse(new TextDecoder().decode(payload)) as { target?: unknown };
            } catch {
              return;
            }
            const target = message?.target;
            if (typeof target !== 'string') return;

            flashAttention(target);
            if (target === next.localParticipant.identity && participant) {
              setIncomingAttention({
                identity: participant.identity,
                name: participantDisplayName(participant),
                avatar: avatarFromParticipant(participant),
              });
              playAttentionSound(() => {
                clearAttentionFlash(target);
                setIncomingAttention(null);
              });
            }
          });

        await next.connect(url, token);

        try {
          await next.localParticipant.setMicrophoneEnabled(true);
        } catch (error) {
          // O `{ exact }` do audioCaptureDefaults é o que garante o microfone
          // escolhido, mas também faz o getUserMedia falhar se ele sumiu entre a
          // escolha e agora (fone desconectado, dispositivo trocado de porta) —
          // sem esse resgate a entrada no canal inteira cairia por causa disso.
          // A ref precisa zerar ANTES da segunda tentativa: é dela que o
          // LocalTrackPublished lê pra reaquisitar a track logo em seguida.
          if (!activeInputDeviceId) throw error;
          inputDeviceIdRef.current = '';
          await next.localParticipant.setMicrophoneEnabled(true, {
            // `undefined` aqui não serve: o mergeDefaultOptions do LiveKit
            // preenche as chaves ausentes com o audioCaptureDefaults da Room e
            // traria o deviceId exigido de volta.
            deviceId: { ideal: 'default' },
            noiseSuppression: true,
          });
          toast({
            title: 'Microfone escolhido indisponível',
            description: 'Entramos com o microfone padrão do sistema.',
          });
        }

        // Captura INICIAL: o LocalTrackPublished reaquire a track logo depois
        // (applyMicProcessing), então divergir aqui do exigido não é
        // necessariamente o microfone errado no ar — é onde olhar primeiro se for.
        // eslint-disable-next-line no-console
        console.debug('[voice-debug] captura inicial do microfone —', {
          salvo: inputDeviceId || '(nenhum)',
          exigido: inputDeviceIdRef.current || '(padrão do sistema)',
          capturado: readMicSource(next),
        });

        // Clicou em "AO VIVO" sem estar conectado ainda (ex: no canal de texto) —
        // já entra assistindo, sem precisar de um segundo clique depois de conectar.
        // Usa `next` (a room recém-criada), não `enterStream`/`room` (que só reflete
        // o state ainda desatualizado nesse mesmo tick).
        if (watchIdentity) watchingRef.current = watchIdentity;

        const initialServerMuted: Record<string, boolean> = {};
        next.remoteParticipants.forEach((participant) => {
          const volume = effectiveVolume(participant.identity);
          if (volume !== undefined) participant.setVolume(volume);
          // Mesma regra do TrackPublished acima, mas para lives que já
          // estavam rolando antes da gente entrar no canal.
          if (participant.identity !== watchingRef.current) setScreenShareSubscribed(participant, false);
          if (participant.attributes.serverMuted === '1') initialServerMuted[participant.identity] = true;
        });
        if (Object.keys(initialServerMuted).length > 0) setServerMutedParticipants(initialServerMuted);

        if (watchIdentity) {
          setScreenShareSubscribed(next.remoteParticipants.get(watchIdentity), true);
          setWatching(watchIdentity);
          await next.localParticipant.setAttributes({ watching: watchIdentity });
        }

        setRoom(next);
        setChannel(joined);
        setMicEnabled(next.localParticipant.isMicrophoneEnabled);
        setServerMuted(next.localParticipant.attributes.serverMuted === '1');
        setStatus('connected');
        initialConnectDone.current = true;
        playSound('join');
      } catch (error) {
        reset();
        toast({
          variant: 'destructive',
          title: 'Falha ao entrar na voz',
          description: error instanceof Error ? error.message : 'Erro inesperado.',
        });
      } finally {
        joining.current = false;
      }
    },
    [
      status,
      channel,
      room,
      reset,
      toast,
      inputDeviceId,
      outputDeviceId,
      videoDeviceId,
      flashAttention,
      clearAttentionFlash,
      enterStream,
    ]
  );

  const leave = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.trace('[voice-debug] leave() called');
    const leavingChannelId = channel?.id;
    await room?.disconnect();
    reset();
    if (leavingChannelId) forceLeaveChannel(leavingChannelId);
  }, [room, reset, channel]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;

    // Silenciado por um channels_admin (ver /api/rtc/mute): só ele pode
    // reverter — o próprio usuário não consegue reativar o microfone sozinho.
    if (next && serverMuted) {
      toast({
        variant: 'destructive',
        title: 'Você está silenciado',
        description: 'Um administrador de canais precisa reativar seu microfone.',
      });
      return;
    }

    if (!guardRateLimit('mic', TOGGLE_RATE_LIMIT)) return;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
    playSound(next ? 'unmute' : 'mute');

    // Ligar o mic enquanto ensurdecido não faz sentido no modelo desse app —
    // ensurdecer sempre implica mudo (ver toggleDeafen), então desligar o mudo
    // aqui também sai do estado de ensurdecido.
    if (next && deafened) {
      setDeafened(false);
      stopAttentionSound();
      await room.localParticipant.setAttributes({ deafened: '0' });
    }
  }, [room, deafened, guardRateLimit, serverMuted, toast]);

  const toggleDeafen = useCallback(async () => {
    if (!guardRateLimit('deafen', TOGGLE_RATE_LIMIT)) return;
    const next = !deafened;
    setDeafened(next);
    deafenedRef.current = next;
    playSound(next ? 'deaf' : 'undeaf');
    if (!next) stopAttentionSound();

    if (!room) return;

    // Corta (ou devolve) o mic de todo mundo — ver setRemoteMicSubscribed.
    // Undeafen sempre resubscreve tudo de volta automaticamente, sem precisar
    // reconectar: LiveKit trata subscription como estado de sessão, não de
    // publicação.
    setRemoteMicSubscribed(room, !next);

    if (next) {
      micEnabledBeforeDeafen.current = room.localParticipant.isMicrophoneEnabled;
      if (room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicEnabled(false);
      }
    } else if (
      micEnabledBeforeDeafen.current &&
      !room.localParticipant.isMicrophoneEnabled &&
      // Silenciado para todos é um bloqueio até um channels_admin liberar — sair
      // do ensurdecido não pode ser um jeito indireto de reativar o microfone
      // por baixo desse bloqueio (mesma regra de toggleMic).
      !serverMuted
    ) {
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicEnabled(true);
    }

    await room.localParticipant.setAttributes({ deafened: next ? '1' : '0' });
  }, [deafened, room, guardRateLimit, serverMuted]);

  const leaveStream = useCallback(async () => {
    // Só toca o som de saída aqui se a transmissão ainda estiver rolando —
    // se o transmissor já encerrou, o TrackUnpublished já tocou o offlive
    // para todos (inclusive nós), e tocar de novo duplicaria o som.
    if (room && watching && room.remoteParticipants.get(watching)?.isScreenShareEnabled) {
      playSound('offlive');
    }

    if (room && watching) setScreenShareSubscribed(room.remoteParticipants.get(watching), false);
    watchingRef.current = null;
    setWatching(null);
    if (!room) return;
    await room.localParticipant.setAttributes({ watching: '' });
  }, [room, watching]);

  const toggleScreenShare = useCallback(async () => {
    if (!room) return;
    if (!guardRateLimit('screenShare', SCREEN_SHARE_RATE_LIMIT)) return;
    const next = !room.localParticipant.isScreenShareEnabled;

    // Só uma coisa por vez: transmitir a própria tela desconecta
    // automaticamente do papel de espectador de outra live, em vez de
    // bloquear a ação com um aviso.
    if (next && watching) await leaveStream();

    // Câmera e screen share são mutuamente exclusivos por participante (ver
    // docs/rfc-camera.md D1) — nunca as duas fontes de vídeo publicadas ao
    // mesmo tempo por quem transmite.
    if (next && room.localParticipant.isCameraEnabled) {
      await room.localParticipant.setCameraEnabled(false);
      setCameraEnabled(false);
      setVideoFacingMode(null);
    }

    try {
      const config = configRef.current;
      const restrictOwnAudio = supportsRestrictOwnAudio();
      const options: ScreenShareCaptureOptions = {
        // O SDK repassa `audio` verbatim pro getDisplayMedia, então a constraint
        // chega inteira mesmo não estando no tipo AudioCaptureOptions.
        // channelCount: 2 pede a captura em estéreo, que é o caso comum pra
        // áudio de jogo/música; fontes só-mono ignoram a constraint sem erro.
        audio: {
          ...(restrictOwnAudio ? { restrictOwnAudio: true } : {}),
          channelCount: 2,
        } as unknown as AudioCaptureOptions,
        // Sem a filtragem, oferecer áudio do sistema é oferecer feedback: resta
        // não oferecê-lo e deixar só o áudio de aba, que já é isolado por
        // natureza (a captura de aba pega só o áudio daquela aba).
        systemAudio: restrictOwnAudio ? 'include' : 'exclude',
        // Orienta o encoder a favorecer movimento sobre detalhe estático desde a
        // captura, coerente com degradationPreference.
        contentHint: 'motion',
      };
      // Captura já na resolução de origem baixa (não em 1080p pra depois reduzir):
      // resolução de origem menor é a metade da política de fluidez > nitidez.
      if (next && config) {
        options.resolution = {
          width: config.screenShareWidth,
          height: config.screenShareHeight,
          frameRate: config.screenShareMaxFramerate,
        };
      }
      await room.localParticipant.setScreenShareEnabled(
        next,
        options,
        // setScreenShareEnabled publica vídeo e áudio (ScreenShareAudio) com o
        // mesmo objeto — cada campo só se aplica à track do kind certo, então
        // dá pra mesclar os dois sets de opções sem conflito.
        config ? { ...screenSharePublishOptions(config), ...screenShareAudioPublishOptions() } : undefined
      );
      setScreenSharing(next);
      if (next) {
        setHasViewer(false);
        reportScreenShareAudio(room, restrictOwnAudio);
      }
    } catch {
      setScreenSharing(room.localParticipant.isScreenShareEnabled);
    }
  }, [room, watching, leaveStream, guardRateLimit]);

  const toggleCamera = useCallback(async () => {
    if (!room) return;
    if (!guardRateLimit('camera', CAMERA_RATE_LIMIT)) return;
    const next = !room.localParticipant.isCameraEnabled;

    // Mesma exclusividade mútua do lado do screen share (D1): ligar a câmera
    // encerra a própria transmissão de tela primeiro, nunca as duas juntas.
    if (next && room.localParticipant.isScreenShareEnabled) {
      await room.localParticipant.setScreenShareEnabled(false);
      setScreenSharing(false);
    }

    try {
      await room.localParticipant.setCameraEnabled(next, CAMERA_CAPTURE_OPTIONS, CAMERA_PUBLISH_OPTIONS);
      setCameraEnabled(next);
      setVideoFacingMode(next ? readCameraFacingMode(room) : null);
    } catch (error) {
      setCameraEnabled(room.localParticipant.isCameraEnabled);
      toast({
        variant: 'destructive',
        title: 'Não foi possível ligar a câmera',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
      });
    }
  }, [room, guardRateLimit, toast]);

  // Troca a câmera física ativa sem passar por deviceId — pede o lado oposto
  // (facingMode) e deixa o navegador escolher qual câmera física atende,
  // mesmo truque usado por qualquer "flip camera" de app de vídeo mobile.
  // Depois de trocar, sincroniza o deviceId escolhido (setVideoDeviceId
  // reaplicaria a troca por cima via switchActiveDevice, daí o restart manual).
  const flipCamera = useCallback(async () => {
    if (!room) return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (!(track instanceof LocalVideoTrack)) return;

    const currentFacing = track.mediaStreamTrack.getSettings().facingMode;
    const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';

    try {
      await track.restartTrack({ ...CAMERA_CAPTURE_OPTIONS, facingMode: nextFacing });
      setVideoFacingMode(readCameraFacingMode(room));
      const newDeviceId = track.mediaStreamTrack.getSettings().deviceId ?? '';
      setVideoDeviceIdState(newDeviceId);
      saveVideoInputDeviceId(newDeviceId);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível virar a câmera',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
      });
    }
  }, [room, toast]);

  // Instrumentação temporária para validar a política de fluidez > resolução
  // (RF-STR): confirma no console se a codificação está de fato estável em
  // vez de oscilar. Fica atrás de SCREEN_SHARE_STATS_DEBUG (NODE_ENV !==
  // 'production') e não deve ir para produção ligada.
  useEffect(() => {
    if (!SCREEN_SHARE_STATS_DEBUG || !screenSharing || !room) return;

    const interval = setInterval(() => {
      const sender = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.sender;
      if (!sender) return;

      void sender.getStats().then((report) => {
        report.forEach((stat) => {
          if (stat.type !== 'outbound-rtp' || stat.kind !== 'video') return;
          console.debug('[rtc] screen share stats', {
            qualityLimitationReason: stat.qualityLimitationReason,
            framesPerSecond: stat.framesPerSecond,
            targetBitrate: stat.targetBitrate,
            frameWidth: stat.frameWidth,
            frameHeight: stat.frameHeight,
            framesSent: stat.framesSent,
            framesDropped: stat.framesDropped,
          });
        });
      });
    }, SCREEN_SHARE_STATS_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [screenSharing, room]);

  // Enquanto a tela está sendo transmitida e ninguém está assistindo (seja por
  // ainda não ter entrado, seja por ter saído da transmissão), encerra
  // automaticamente após um tempo limite (evita gastar banda/consumo do
  // LiveKit com uma transmissão sem espectadores).
  useEffect(() => {
    if (!screenSharing || !room || hasViewer) {
      setScreenShareCountdown(null);
      return;
    }

    setScreenShareCountdown(SCREEN_SHARE_IDLE_TIMEOUT_MS / 1000);

    const interval = setInterval(() => {
      setScreenShareCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          void room.localParticipant.setScreenShareEnabled(false).then(() => {
            setScreenSharing(false);
            toast({
              title: 'Transmissão encerrada',
              description: 'Ninguém entrou para assistir em 1 minuto, então a transmissão foi encerrada automaticamente.',
            });
          });
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [screenSharing, hasViewer, room, toast]);

  const disconnectParticipant = useCallback(
    async (channelId: string, identity: string) => {
      try {
        const response = await fetch('/api/rtc/kick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, identity }),
        });
        if (!response.ok) throw new Error();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Não foi possível desconectar',
          description: 'Tente novamente em instantes.',
        });
      }
    },
    [toast]
  );

  const removeSpectator = useCallback(
    async (identity: string) => {
      if (!channel) return;
      try {
        const response = await fetch('/api/rtc/unwatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.id, identity }),
        });
        if (!response.ok) throw new Error();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Não foi possível remover o espectador',
          description: 'Tente novamente em instantes.',
        });
      }
    },
    [channel, toast]
  );

  const stopStream = useCallback(
    async (identity: string) => {
      if (!channel) return;
      try {
        const response = await fetch('/api/rtc/stop-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.id, identity }),
        });
        if (!response.ok) throw new Error();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Não foi possível encerrar a transmissão',
          description: 'Tente novamente em instantes.',
        });
      }
    },
    [channel, toast]
  );

  const stopCamera = useCallback(
    async (identity: string) => {
      if (!channel) return;
      try {
        const response = await fetch('/api/rtc/stop-camera', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.id, identity }),
        });
        if (!response.ok) throw new Error();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Não foi possível desligar a câmera',
          description: 'Tente novamente em instantes.',
        });
      }
    },
    [channel, toast]
  );

  const setInputDeviceId = useCallback(
    async (deviceId: string) => {
      inputDeviceIdRef.current = deviceId;
      setInputDeviceIdState(deviceId);
      saveAudioInputDeviceId(deviceId);
      if (!room) return;

      try {
        await room.switchActiveDevice('audioinput', deviceId);
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível trocar o microfone',
          description: error instanceof Error ? error.message : 'Erro inesperado.',
        });
      }
    },
    [room, toast]
  );

  const setOutputDeviceId = useCallback(
    async (deviceId: string) => {
      setOutputDeviceIdState(deviceId);
      saveAudioOutputDeviceId(deviceId);
      if (!room) return;

      try {
        await room.switchActiveDevice('audiooutput', deviceId);
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível trocar a saída de áudio',
          description: error instanceof Error ? error.message : 'Erro inesperado.',
        });
      }
    },
    [room, toast]
  );

  const setVideoDeviceId = useCallback(
    async (deviceId: string) => {
      setVideoDeviceIdState(deviceId);
      saveVideoInputDeviceId(deviceId);
      if (!room) return;

      try {
        await room.switchActiveDevice('videoinput', deviceId);
        setVideoFacingMode(readCameraFacingMode(room));
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível trocar a câmera',
          description: error instanceof Error ? error.message : 'Erro inesperado.',
        });
      }
    },
    [room, toast]
  );

  // Atualiza o gate JÁ EM EXECUÇÃO, sem reaquisitar o microfone: arrastar o
  // slider de sensibilidade no meio de uma chamada não pode cortar o áudio por
  // um instante (ver updateNoiseGateThreshold).
  const setNoiseGateThreshold = useCallback(
    (thresholdDb: number) => {
      noiseGateThresholdRef.current = thresholdDb;
      setNoiseGateThresholdState(thresholdDb);
      saveNoiseGateThreshold(thresholdDb);

      const track = room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (track instanceof LocalAudioTrack) updateNoiseGateThreshold(track, thresholdDb);
    },
    [room]
  );

  const getParticipantVolume = useCallback(
    (identity: string) => participantVolumes[identity] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes]
  );

  const setParticipantVolume = useCallback(
    (identity: string, volume: number) => {
      volume = Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, volume));
      setParticipantVolumes((prev) => ({ ...prev, [identity]: volume }));
      saveParticipantVolume(identity, volume);
      setMutedParticipants((prev) => {
        if (!prev[identity]) return prev;
        saveMutedParticipant(identity, false);
        const next = { ...prev };
        delete next[identity];
        return next;
      });
      room?.remoteParticipants.get(identity)?.setVolume(volume);
    },
    [room]
  );

  const getStreamVolume = useCallback(
    (identity: string) => streamVolumes[identity] ?? DEFAULT_PARTICIPANT_VOLUME,
    [streamVolumes]
  );

  const setStreamVolume = useCallback(
    (identity: string, volume: number) => {
      volume = Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, volume));
      setStreamVolumes((prev) => ({ ...prev, [identity]: volume }));
      room?.remoteParticipants.get(identity)?.setVolume(volume, Track.Source.ScreenShareAudio);
    },
    [room]
  );

  const isParticipantMuted = useCallback((identity: string) => Boolean(mutedParticipants[identity]), [mutedParticipants]);

  const toggleParticipantMute = useCallback(
    (identity: string) => {
      const muted = !mutedParticipants[identity];
      setMutedParticipants((prev) => ({ ...prev, [identity]: muted }));
      saveMutedParticipant(identity, muted);
      const volume = muted ? 0 : (participantVolumes[identity] ?? DEFAULT_PARTICIPANT_VOLUME);
      room?.remoteParticipants.get(identity)?.setVolume(volume);
    },
    [mutedParticipants, participantVolumes, room]
  );

  const isServerMuted = useCallback((identity: string) => Boolean(serverMutedParticipants[identity]), [serverMutedParticipants]);

  const toggleServerMute = useCallback(
    async (identity: string) => {
      if (!channel) return;
      const muted = !serverMutedParticipants[identity];
      setServerMutedParticipants((prev) => ({ ...prev, [identity]: muted }));
      try {
        const response = await fetch('/api/rtc/mute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.id, identity, muted }),
        });
        if (!response.ok) throw new Error();
      } catch {
        setServerMutedParticipants((prev) => ({ ...prev, [identity]: !muted }));
        toast({
          variant: 'destructive',
          title: 'Não foi possível silenciar',
          description: 'Tente novamente em instantes.',
        });
      }
    },
    [channel, serverMutedParticipants, toast]
  );

  const callAttention = useCallback(
    (identity: string) => {
      if (!room) return;
      const now = Date.now();
      const until = attentionCooldownUntil[identity] ?? 0;
      if (now < until) return;

      setAttentionCooldownUntil((prev) => ({ ...prev, [identity]: now + ATTENTION_COOLDOWN_MS }));
      flashAttention(identity);
      // TextEncoder tipa o retorno como Uint8Array<ArrayBufferLike> (por causa do
      // SharedArrayBuffer na união), mas nunca devolve um buffer compartilhado de
      // verdade — publishData exige o Uint8Array<ArrayBuffer> não-compartilhado.
      const payload = new TextEncoder().encode(JSON.stringify({ target: identity })) as Uint8Array<ArrayBuffer>;
      void room.localParticipant.publishData(payload, { reliable: true, topic: 'attention' });
    },
    [room, attentionCooldownUntil, flashAttention]
  );

  const getAttentionCooldown = useCallback(
    (identity: string) => Math.max(0, (attentionCooldownUntil[identity] ?? 0) - Date.now()),
    [attentionCooldownUntil]
  );

  const isCallingAttention = useCallback((identity: string) => Boolean(attentionFlashes[identity]), [attentionFlashes]);

  // Clique do usuário no botão "Ativar áudio" do card de atenção. Dois casos:
  // - o autoplay automático (ver DataReceived) foi bloqueado pelo navegador ⇒
  //   esse clique é o primeiro gesto explícito, então toca o som (e destrava
  //   quem estiver ensurdecido, já que é esse o motivo de existir "chamar atenção").
  // - o som já está tocando (autoplay não foi bloqueado) ⇒ o clique é o usuário
  //   reconhecendo o alerta, então para o som — igual ao toggleDeafen/toggleMic
  //   já fazem no dock. Sem esse branch o áudio nunca parava de verdade, porque
  //   playAttentionSound era chamado de novo logo em seguida.
  const toggleAttentionAudio = useCallback(() => {
    if (!incomingAttention || !room) return;

    if (isAttentionSoundPlaying()) {
      stopAttentionSound();
      return;
    }

    const identity = room.localParticipant.identity;
    if (deafened) void toggleDeafen();
    playAttentionSound(() => {
      clearAttentionFlash(identity);
      setIncomingAttention(null);
    });
  }, [incomingAttention, room, clearAttentionFlash, deafened, toggleDeafen]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      status,
      channel,
      micEnabled,
      deafened,
      serverMuted,
      screenSharing,
      screenShareCountdown,
      watching,
      streamQuality,
      cameraEnabled,
      videoFacingMode,
      join,
      leave,
      toggleMic,
      toggleDeafen,
      toggleScreenShare,
      toggleCamera,
      flipCamera,
      enterStream,
      leaveStream,
      disconnectParticipant,
      removeSpectator,
      stopStream,
      stopCamera,
      inputDeviceId,
      outputDeviceId,
      videoDeviceId,
      setInputDeviceId,
      setOutputDeviceId,
      setVideoDeviceId,
      noiseGateThreshold,
      setNoiseGateThreshold,
      getParticipantVolume,
      setParticipantVolume,
      isParticipantMuted,
      toggleParticipantMute,
      getStreamVolume,
      setStreamVolume,
      isServerMuted,
      toggleServerMute,
      callAttention,
      getAttentionCooldown,
      isCallingAttention,
      incomingAttention,
      toggleAttentionAudio,
    }),
    [
      status,
      channel,
      micEnabled,
      deafened,
      serverMuted,
      screenSharing,
      screenShareCountdown,
      watching,
      streamQuality,
      cameraEnabled,
      videoFacingMode,
      join,
      leave,
      toggleMic,
      toggleDeafen,
      toggleScreenShare,
      toggleCamera,
      flipCamera,
      enterStream,
      leaveStream,
      disconnectParticipant,
      removeSpectator,
      stopStream,
      stopCamera,
      inputDeviceId,
      outputDeviceId,
      videoDeviceId,
      setInputDeviceId,
      setOutputDeviceId,
      setVideoDeviceId,
      noiseGateThreshold,
      setNoiseGateThreshold,
      getParticipantVolume,
      setParticipantVolume,
      isParticipantMuted,
      toggleParticipantMute,
      getStreamVolume,
      setStreamVolume,
      isServerMuted,
      toggleServerMute,
      callAttention,
      getAttentionCooldown,
      isCallingAttention,
      incomingAttention,
      toggleAttentionAudio,
    ]
  );

  return (
    <VoiceContext.Provider value={value}>
      <RoomContext.Provider value={room ?? undefined}>
        {children}
        {room && <RoomAudioRenderer muted={deafened} />}
        <CallScreenDim active={status === 'connected'} dimAllowed={!screenSharing && !cameraEnabled} room={room} />
        <FloatingCameraBubble active={status === 'connected'} room={room} />
        <MobileStreamView active={status === 'connected'} room={room} />
      </RoomContext.Provider>
    </VoiceContext.Provider>
  );
}
