'use client';

import { useEffect, useState } from 'react';
import type { UserDTO } from '@/app/api/user/types';
import { useVoice } from '@/providers/VoiceProvider';
import { useChannelPresence } from '@/hooks/useChannelPresence';
import { useRtcEnabled } from '@/hooks/useRtcEnabled';
import VoiceChannelStage from '@/components/VoiceDock/VoiceChannelStage';

/** Conteúdo à direita da sidebar fixa de canais para uma sala de voz específica. */
export default function VoiceChannelContent({
  channelId,
  channelName,
  user,
}: {
  channelId: string;
  channelName: string;
  user: UserDTO | null;
}) {
  const { status, channel, join, watching } = useVoice();
  const connected = status === 'connected' && channel?.id === channelId;
  const { rtcEnabled } = useRtcEnabled(true);
  const presence = useChannelPresence(channelId, !connected && rtcEnabled);
  // Qual câmera ocupa o centro do palco (no lugar da live assistida) — local
  // a essa aba, nunca sincronizado por sala: cada espectador escolhe por
  // conta própria o que fica no seu centro (ver docs/rfc-camera.md).
  const [focusedCameraSid, setFocusedCameraSid] = useState<string | null>(null);

  // Só limpa quando SAI de uma live assistida (watching muda pra falsy) —
  // focar uma câmera enquanto não assiste nada (grid central, sem live) não
  // deve ser afetado, e esse efeito só reage a mudança, não ao valor parado.
  // Sem isso o foco sobrevivia à troca de transmissão carregando estado
  // morto pra próxima vez que assistir outra.
  useEffect(() => {
    if (!watching) setFocusedCameraSid(null);
  }, [watching]);

  return (
    <div className="flex h-full flex-col">
      <VoiceChannelStage
        channelName={channelName}
        user={user}
        connected={connected}
        presenceParticipants={presence.participants}
        onJoin={() => join(channelId)}
        onWatchParticipant={(identity) => void join(channelId, identity)}
        joining={status === 'connecting'}
        rtcEnabled={rtcEnabled}
        focusedCameraSid={focusedCameraSid}
        onFocusCamera={setFocusedCameraSid}
        onUnfocusCamera={() => setFocusedCameraSid(null)}
      />
    </div>
  );
}
