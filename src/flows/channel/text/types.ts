import type { MessageDTO } from '@/lib/chat/dto';
import type { AttachmentKind } from '@/lib/chat/attachments';

export type MessageStatus = 'sent' | 'sending' | 'error';

export interface ClientMessage extends MessageDTO {
  clientNonce?: string;
  status: MessageStatus;
  /** 0..1 enquanto os bytes sobem — só existe em mensagem otimista com anexo (ver useChatMessages). */
  uploadProgress?: number;
}

export interface CurrentUser {
  id: string;
  username: string;
  avatar: string;
}

/**
 * Anexo ainda não subido pro R2 — só sobe no submit da mensagem (ver
 * useChatAttachment). `kind` aqui é o palpite do cliente pelo `file.type`; a
 * espécie que vale é a que a rota de upload fareja dos bytes (ver ADR-0013).
 */
export interface PendingUpload {
  file: File;
  kind: AttachmentKind;
  previewUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface SendMessageInput {
  content: string | null;
  attachment: PendingUpload | null;
  replyToId: string | null;
  replyToPreview: MessageDTO['replyTo'];
  mentions: MessageDTO['mentions'];
}

export interface SendMessageResult {
  ok: boolean;
  error?: string;
  retryAfterMs?: number;
}
