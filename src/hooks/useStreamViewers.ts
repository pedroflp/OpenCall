'use client';

import { useEffect, useState } from 'react';
import type { Participant } from 'livekit-client';
import { RoomEvent } from 'livekit-client';
import { useParticipants, useRoomContext } from '@livekit/components-react';

export function useStreamViewers(streamerIdentity: string): Participant[] {
  const room = useRoomContext();
  const participants = useParticipants();
  const [, bump] = useState(0);

  useEffect(() => {
    const sync = () => bump((n) => n + 1);
    room.on(RoomEvent.ParticipantAttributesChanged, sync);
    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, sync);
    };
  }, [room]);

  return participants.filter(
    (participant) => participant.identity !== streamerIdentity && participant.attributes.watching === streamerIdentity
  );
}
