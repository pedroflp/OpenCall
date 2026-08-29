'use client';

import { useEffect, useState } from 'react';
import type { Participant, Room } from 'livekit-client';
import { RoomEvent, Track } from 'livekit-client';
import { useIsSpeaking, useRoomContext } from '@livekit/components-react';
import { createAudioContext } from '@/lib/rtc/noiseSuppression';

const SPEAKING_RMS_THRESHOLD = 0.02;
const POLL_INTERVAL_MS = 100;
const RELEASE_MS = 300;

// Um AudioContext só pra sala inteira — cada tracker pendura seu próprio
// AnalyserNode nele em vez de abrir o próprio contexto. iOS Safari trava
// depois de poucos AudioContexts simultâneos.
let sharedAudioContext: AudioContext | undefined;
function getSharedAudioContext(): AudioContext | undefined {
  if (!sharedAudioContext) {
    sharedAudioContext = createAudioContext();
    void sharedAudioContext?.resume();
  } else if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

interface SpeakingTracker {
  refCount: number;
  speaking: boolean;
  listeners: Set<(speaking: boolean) => void>;
  release: () => void;
}

// O mesmo participante pode estar montado em até 3 telas ao mesmo tempo
// (lista lateral, palco central, overlay de dim). Sem esse cache cada tela
// abriria seu próprio MediaStreamAudioSourceNode em cima da MESMA
// MediaStreamTrack, triplicando o trabalho de análise à toa — aqui só a
// primeira tela monta o analyser de verdade, as outras só assinam o
// resultado.
const trackers = new Map<string, SpeakingTracker>();

function createTracker(participant: Participant, room: Room): SpeakingTracker {
  const listeners = new Set<(speaking: boolean) => void>();
  let analyser: AnalyserNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  const tracker: SpeakingTracker = { refCount: 0, speaking: false, listeners, release: () => {} };

  function setSpeaking(next: boolean) {
    if (tracker.speaking === next) return;
    tracker.speaking = next;
    listeners.forEach((listener) => listener(next));
  }

  function detachAnalyser() {
    clearInterval(pollTimer);
    clearTimeout(releaseTimer);
    releaseTimer = undefined;
    source?.disconnect();
    analyser?.disconnect();
    analyser = undefined;
    source = undefined;
    setSpeaking(false);
  }

  function attach() {
    detachAnalyser();
    const context = getSharedAudioContext();
    const publication = participant.getTrackPublication(Track.Source.Microphone);
    const mediaTrack = publication?.track?.mediaStreamTrack;
    if (!context || !mediaTrack || publication.isMuted) return;

    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.fftSize);
    pollTimer = setInterval(() => {
      analyser!.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] / 128 - 1;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      if (rms > SPEAKING_RMS_THRESHOLD) {
        clearTimeout(releaseTimer);
        releaseTimer = undefined;
        setSpeaking(true);
      } else if (!releaseTimer) {
        releaseTimer = setTimeout(() => setSpeaking(false), RELEASE_MS);
      }
    }, POLL_INTERVAL_MS);
  }

  // room é compartilhado por toda a sala — filtra pra só reanexar quando o
  // evento é desse participante (mesmo motivo do syncIfSelf em useParticipantMedia).
  const onParticipantEvent = (...args: unknown[]) => {
    const changed = args.find((arg): arg is Participant => arg instanceof Object && 'identity' in (arg as object));
    if (changed && changed.identity !== participant.identity) return;
    attach();
  };

  const events = [
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed,
    RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished,
  ];
  events.forEach((event) => room.on(event, onParticipantEvent));
  attach();

  tracker.release = () => {
    events.forEach((event) => room.off(event, onParticipantEvent));
    detachAnalyser();
  };

  return tracker;
}

function acquireTracker(participant: Participant, room: Room): SpeakingTracker {
  const existing = trackers.get(participant.identity);
  const tracker = existing ?? createTracker(participant, room);
  if (!existing) trackers.set(participant.identity, tracker);
  tracker.refCount += 1;
  return tracker;
}

function releaseTracker(participant: Participant) {
  const tracker = trackers.get(participant.identity);
  if (!tracker) return;
  tracker.refCount -= 1;
  if (tracker.refCount > 0) return;
  tracker.release();
  trackers.delete(participant.identity);
}

/**
 * `Participant.isSpeaking` do LiveKit vem do ActiveSpeakersUpdate, relayado
 * pelo SFU — fica ~1s atrás do início real da fala. Aqui a gente lê o nível
 * do áudio já decodificado localmente (mic local ou faixa remota assinada)
 * com um AnalyserNode, então o indicativo acende assim que o som chega, sem
 * esperar o servidor confirmar. `useIsSpeaking` some como fallback (ex.:
 * autoplay bloqueado, faixa ainda não assinada).
 */
export function useSpeakingIndicator(participant: Participant): boolean {
  const serverSpeaking = useIsSpeaking(participant);
  const room = useRoomContext();
  const [localSpeaking, setLocalSpeaking] = useState(false);

  useEffect(() => {
    const tracker = acquireTracker(participant, room);
    setLocalSpeaking(tracker.speaking);
    tracker.listeners.add(setLocalSpeaking);

    return () => {
      tracker.listeners.delete(setLocalSpeaking);
      releaseTracker(participant);
    };
  }, [room, participant]);

  return serverSpeaking || localSpeaking;
}
