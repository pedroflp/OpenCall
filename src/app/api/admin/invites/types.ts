export type AdminInviteDTO = {
  id: string;
  code: string;
  createdAt: string;
  revokedAt: string | null;
  redeemedCount: number;
};
