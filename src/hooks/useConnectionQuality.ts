'use client';

import { useEffect, useState } from 'react';
import type { Participant } from 'livekit-client';
import { ConnectionQuality, RoomEvent, Track } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

const PING_SAMPLE_INTERVAL_MS = 3_000;
const PING_HISTORY_LENGTH = 20;

export interface ConnectionQualityState {
  quality: ConnectionQuality;
  ping: number | null;
  history: number[];
}

// RTT só existe do ponto de vista de quem mede — cada participante só
// consegue ler o round-trip do próprio peer connection até o SFU, nunca o dos
// outros. Por isso isso é sempre sobre o participante local, mesmo que
// ConnectionQuality (calculado no servidor) exista pra qualquer participante.
export function useConnectionQuality(): ConnectionQualityState {
  const room = useRoomContext();
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [ping, setPing] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!room) return;

    const syncIfSelf = (q: ConnectionQuality, participant: Participant) => {
      if (participant.identity !== room.localParticipant.identity) return;
      setQuality(q);
    };

    setQuality(room.localParticipant.connectionQuality);
    room.on(RoomEvent.ConnectionQualityChanged, syncIfSelf);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, syncIfSelf);
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;

    const measure = () => {
      const sender = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.sender;
      if (!sender) return;

      void sender.getStats().then((report) => {
        report.forEach((stat) => {
          if (stat.type !== 'candidate-pair' || typeof stat.currentRoundTripTime !== 'number') return;
          if (stat.state && stat.state !== 'succeeded') return;
          const ms = Math.round(stat.currentRoundTripTime * 1000);
          setPing(ms);
          setHistory((prev) => [...prev.slice(-(PING_HISTORY_LENGTH - 1)), ms]);
        });
      });
    };

    measure();
    const interval = setInterval(measure, PING_SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [room]);

  return { quality, ping, history };
}
