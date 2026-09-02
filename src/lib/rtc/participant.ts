import type { Participant } from 'livekit-client';

function parseMetadata(participant: Participant): { avatar?: string; isAdmin?: boolean; discordUsername?: string } {
  if (!participant.metadata) return {};
  try {
    return JSON.parse(participant.metadata) as { avatar?: string; isAdmin?: boolean; discordUsername?: string };
  } catch {
    return {};
  }
}

export function avatarFromParticipant(participant: Participant): string | undefined {
  return parseMetadata(participant).avatar;
}

/** ADMIN completo (não confundir com channels_access) — usado pra decidir se um channels_admin pode desconectar esse participante. */
export function isAdminFromParticipant(participant: Participant): boolean {
  return Boolean(parseMetadata(participant).isAdmin);
}

export function participantDisplayName(participant: Participant): string {
  return participant.name || participant.identity;
}

/** O username do Discord quando um apelido o está cobrindo — `undefined` quando não há o que revelar (ver ChannelsIdentity). */
export function discordUsernameFromParticipant(participant: Participant): string | undefined {
  return parseMetadata(participant).discordUsername;
}
