import type { MessageDTO } from '@/lib/chat/dto';

export type MessageStatus = 'sent' | 'sending' | 'error';

export interface ClientMessage extends MessageDTO {
  clientNonce?: string;
  status: MessageStatus;
}

export interface CurrentUser {
  id: string;
  username: string;
  avatar: string;
}

/** Anexo ainda não subido pro R2 — só sobe no submit da mensagem (ver useChatAttachment). */
export interface PendingImage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

export interface SendMessageInput {
  content: string | null;
  image: PendingImage | null;
  replyToId: string | null;
  replyToPreview: MessageDTO['replyTo'];
  mentions: MessageDTO['mentions'];
}

export interface SendMessageResult {
  ok: boolean;
  error?: string;
  retryAfterMs?: number;
}
