'use client';

import { useParticipants } from '@livekit/components-react';
import ParticipantTile from './ParticipantTile';

export default function LiveParticipantsList({ className }: { className?: string }) {
  const participants = useParticipants();

  return (
    <ul className={className}>
      {participants.map((participant) => (
        <ParticipantTile key={participant.identity} participant={participant} />
      ))}
    </ul>
  );
}
