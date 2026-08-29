export type UserDTO = {
  id: string;
  username: string;
  avatar: string;
  createdAt: string;
  verified: boolean;
  roles?: UserRoles[];
  channelPreferences?: ChannelPreferences;
  groups?: string[];
  isMobileDownloaded: boolean;
}

export type ChannelPreferences = {
  /** 0 a 1.5 — 1 é o volume nativo (100%), acima disso é ganho via Web Audio. */
  participantVolumes?: Record<string, number>;
  mutedParticipants?: Record<string, boolean>;
  /** 0 a 1 — volume dos efeitos sonoros da UI (entrar/sair, mute, etc). */
  soundEffectsVolume?: number;
}

export type DiscordUserDTO = {
  id: string;
  username: string;
  avatar?: string | null;
  email?: string | null;
}

export enum UserRoles {
  ADMIN = "admin",
  CANAL_ACCESS = "canal_access",
  // Pode administrar quem tem CHANNELS_ACCESS (via /admin, aba Usuários), sem
  // ser um ADMIN completo. ADMIN + CHANNELS_ACCESS juntos = "superadmin": só
  // quem tem ADMIN pode desativar CHANNELS_ACCESS de outro ADMIN (ver
  // src/lib/access.ts e a rota channels-admin-role).
  CHANNELS_ACCESS = "channels_access",
}
