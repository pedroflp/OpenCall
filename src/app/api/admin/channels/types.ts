import type { ChannelType } from '@prisma/client';

export type AdminChannelDTO = {
  id: string;
  type: ChannelType;
  name: string;
  /** Só voice; null pra text (ver ADR-0001). */
  maxParticipants: number | null;
  sortIndex: number;
  createdAt: string;
  /** Mensagens que seriam apagadas junto num hard-delete — só texto tem histórico relevante pra avisar (ver ADR-0003 revisada). Sempre 0 pra voice. */
  messageCount: number;
};
