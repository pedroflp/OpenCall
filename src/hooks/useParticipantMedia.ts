'use client';

import { useEffect, useState } from 'react';
import type { Participant } from 'livekit-client';
import { RoomEvent } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

export interface ParticipantMediaState {
  micEnabled: boolean;
  screenSharing: boolean;
  cameraEnabled: boolean;
  deafened: boolean;
}

function readState(participant: Participant): ParticipantMediaState {
  return {
    micEnabled: participant.isMicrophoneEnabled,
    screenSharing: participant.isScreenShareEnabled,
    cameraEnabled: participant.isCameraEnabled,
    deafened: participant.attributes.deafened === '1',
  };
}

function sameState(a: ParticipantMediaState, b: ParticipantMediaState): boolean {
  return (
    a.micEnabled === b.micEnabled &&
    a.screenSharing === b.screenSharing &&
    a.cameraEnabled === b.cameraEnabled &&
    a.deafened === b.deafened
  );
}

export function useParticipantMedia(participant: Participant): ParticipantMediaState {
  const room = useRoomContext();
  const [state, setState] = useState(() => readState(participant));

  useEffect(() => {
    // room é um EventEmitter compartilhado por toda a sala — sem o filtro por
    // identity abaixo, cada mute/publish de QUALQUER participante recalcularia
    // e re-renderizaria TODOS os tiles montados, não só o dono do evento.
    const syncIfSelf = (...args: unknown[]) => {
      const eventParticipant = args.find((arg): arg is Participant => arg instanceof Object && 'identity' in (arg as object));
      if (eventParticipant && eventParticipant.identity !== participant.identity) return;
      setState((prev) => {
        const next = readState(participant);
        return sameState(prev, next) ? prev : next;
      });
    };

    syncIfSelf();
    const events = [
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantAttributesChanged,
    ];
    events.forEach((event) => room.on(event, syncIfSelf));
    return () => {
      events.forEach((event) => room.off(event, syncIfSelf));
    };
  }, [room, participant]);

  return state;
}
