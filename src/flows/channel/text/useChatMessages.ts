'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageDTO } from '@/lib/chat/dto';
import type { ChatEvent } from '@/lib/chat/signal';
import { subscribeToChatConnection, subscribeToChatResync } from '@/lib/chat/realtime';
import type { ClientMessage, CurrentUser, SendMessageInput, SendMessageResult } from './types';

const UPLOADS_URL = '/api/chat/uploads';

export interface ClearMessagesResult {
  ok: boolean;
  error?: string;
  count?: number;
}

/**
 * XMLHttpRequest, não fetch: é a única API do browser que expõe progresso de
 * upload (`upload.onprogress`), e sem barra de progresso um vídeo de 80MB
 * parece travado. O arquivo vai como corpo cru — nome e tamanho na query (ver
 * ADR-0011).
 */
function uploadAttachmentFile(file: File, onProgress: (fraction: number) => void): Promise<{ key: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${UPLOADS_URL}?name=${encodeURIComponent(file.name)}&size=${file.size}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as { key: string });
      else reject(new Error((xhr.response as { error?: string } | null)?.error ?? 'UPLOAD_FAILED'));
    };
    xhr.onerror = () => reject(new Error('UPLOAD_FAILED'));
    xhr.onabort = () => reject(new Error('UPLOAD_FAILED'));
    xhr.send(file);
  });
}

/** Best-effort: upload terminou mas a mensagem nunca foi criada (ver deleteAttachment em storage.ts) — nunca deixa a UI esperando por isso. */
function deleteOrphanAttachment(key: string): void {
  fetch(`${UPLOADS_URL}?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
}

function sortByCreatedAt(messages: ClientMessage[]): ClientMessage[] {
  return [...messages].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/**
 * Uma mensagem real (chegada por resposta do POST ou por SSE, o que vier
 * primeiro) nunca é duplicada: se o id já existe, no-op; se existe uma
 * otimista pendente com o mesmo nonce, ela é promovida; senão, é anexada —
 * é o dedupe de A5 na RFC-008, compartilhado pelos dois caminhos de chegada.
 */
function upsertFromServer(prev: ClientMessage[], dto: MessageDTO, clientNonce?: string): ClientMessage[] {
  if (prev.some((m) => m.id === dto.id)) return prev;

  const optimisticIndex = clientNonce ? prev.findIndex((m) => m.clientNonce === clientNonce && m.status !== 'sent') : -1;
  if (optimisticIndex !== -1) {
    const next = [...prev];
    next[optimisticIndex] = { ...dto, clientNonce, status: 'sent' };
    return sortByCreatedAt(next);
  }

  return sortByCreatedAt([...prev, { ...dto, status: 'sent' }]);
}

interface MessagesPage {
  messages: MessageDTO[];
  nextCursor: string | null;
  blocked: boolean;
}

export function useChatMessages(channelId: string, currentUser: CurrentUser | null) {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingInputsRef = useRef<Map<string, SendMessageInput>>(new Map());
  const messagesUrl = `/api/chat/messages?channelId=${encodeURIComponent(channelId)}`;

  const loadInitial = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const response = await fetch(messagesUrl);
      if (!response.ok) return;
      const data = (await response.json()) as MessagesPage;
      setMessages(sortByCreatedAt(data.messages.map((message) => ({ ...message, status: 'sent' as const }))));
      nextCursorRef.current = data.nextCursor;
      setHasMore(Boolean(data.nextCursor));
      setBlocked(data.blocked);
    } finally {
      setLoadingInitial(false);
    }
  }, [messagesUrl]);

  const loadOlder = useCallback(async () => {
    if (!nextCursorRef.current || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const response = await fetch(`${messagesUrl}&cursor=${encodeURIComponent(nextCursorRef.current)}`);
      if (!response.ok) return;
      const data = (await response.json()) as MessagesPage;
      const older = sortByCreatedAt(data.messages.map((message) => ({ ...message, status: 'sent' as const })));
      setMessages((prev) => [...older, ...prev]);
      nextCursorRef.current = data.nextCursor;
      setHasMore(Boolean(data.nextCursor));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [messagesUrl]);

  const resync = useCallback(async () => {
    try {
      const response = await fetch(messagesUrl);
      if (!response.ok) return;
      const data = (await response.json()) as MessagesPage;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = data.messages.filter((m) => !existingIds.has(m.id)).map((m) => ({ ...m, status: 'sent' as const }));
        return fresh.length === 0 ? prev : sortByCreatedAt([...prev, ...fresh]);
      });
      setBlocked(data.blocked);
    } catch {
      // Próxima reconexão tenta de novo.
    }
  }, [messagesUrl]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    return subscribeToChatConnection((event: ChatEvent) => {
      // Uma única conexão SSE por aba cobre todos os canais (ver realtime.ts)
      // — cada hook filtra pelo canal que está exibindo.
      if (event.type === 'message') {
        if (event.channelId !== channelId) return;
        setMessages((prev) => upsertFromServer(prev, event.message, event.clientNonce));
      } else if (event.type === 'deleted') {
        if (event.channelId !== channelId) return;
        setMessages((prev) => prev.filter((m) => m.id !== event.id));
      } else if (event.type === 'cleared') {
        if (event.channelId !== channelId) return;
        const clearedIds = new Set(event.ids);
        setMessages((prev) => prev.filter((m) => !clearedIds.has(m.id)));
      } else if (event.type === 'blocked' && event.userId === currentUser?.id) {
        setBlocked(event.blocked);
      }
    });
  }, [channelId, currentUser?.id]);

  useEffect(() => subscribeToChatResync(() => void resync()), [resync]);

  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<SendMessageResult> => {
      if (!currentUser) return { ok: false, error: 'UNAUTHENTICATED' };

      const clientNonce = crypto.randomUUID();
      pendingInputsRef.current.set(clientNonce, input);
      const optimistic: ClientMessage = {
        id: clientNonce,
        channelId,
        content: input.content,
        // Preview local (blob:) — a key real só existe depois do upload logo
        // abaixo, então ainda não há URL pública pra apontar. `kind` e `mime`
        // são o palpite do cliente; o DTO do servidor sobrescreve os dois na
        // confirmação (ver ADR-0013).
        attachment: input.attachment
          ? {
              kind: input.attachment.kind,
              url: input.attachment.previewUrl,
              name: input.attachment.file.name,
              mime: input.attachment.file.type || 'application/octet-stream',
              bytes: input.attachment.file.size,
              width: input.attachment.width,
              height: input.attachment.height,
              durationMs: input.attachment.durationMs,
            }
          : null,
        author: currentUser,
        hasReply: input.replyToId !== null,
        replyTo: input.replyToPreview,
        mentions: input.mentions,
        createdAt: new Date().toISOString(),
        clientNonce,
        status: 'sending',
        uploadProgress: input.attachment ? 0 : undefined,
      };

      setMessages((prev) => sortByCreatedAt([...prev, optimistic]));

      const trackProgress = (fraction: number) =>
        setMessages((prev) => prev.map((m) => (m.clientNonce === clientNonce ? { ...m, uploadProgress: fraction } : m)));

      // Sobe o arquivo só agora — anexo descartado antes do envio nunca chega
      // a existir no R2 (ver useChatAttachment).
      let uploadedKey: string | null = null;

      try {
        if (input.attachment) {
          const uploaded = await uploadAttachmentFile(input.attachment.file, trackProgress);
          uploadedKey = uploaded.key;
        }

        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            content: input.content,
            // Só a chave e o metadado de apresentação: espécie, mime, tamanho e
            // nome o servidor tira do próprio objeto (ver §5.4 da RFC).
            attachment:
              uploadedKey && input.attachment
                ? {
                    key: uploadedKey,
                    width: input.attachment.width,
                    height: input.attachment.height,
                    durationMs: input.attachment.durationMs,
                  }
                : null,
            replyToId: input.replyToId,
            mentionedUserIds: input.mentions.map((mention) => mention.id),
            clientNonce,
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string; retryAfterMs?: number } | null;
          if (uploadedKey) deleteOrphanAttachment(uploadedKey);
          setMessages((prev) => prev.map((m) => (m.clientNonce === clientNonce ? { ...m, status: 'error' } : m)));
          return { ok: false, error: data?.error, retryAfterMs: data?.retryAfterMs };
        }

        const dto = (await response.json()) as MessageDTO & { clientNonce: string };
        pendingInputsRef.current.delete(clientNonce);
        setMessages((prev) => upsertFromServer(prev, dto, clientNonce));
        if (input.attachment) URL.revokeObjectURL(input.attachment.previewUrl);
        return { ok: true };
      } catch (error) {
        if (uploadedKey) deleteOrphanAttachment(uploadedKey);
        setMessages((prev) => prev.map((m) => (m.clientNonce === clientNonce ? { ...m, status: 'error' } : m)));
        return { ok: false, error: error instanceof Error ? error.message : 'NETWORK_ERROR' };
      }
    },
    [channelId, currentUser],
  );

  const discardMessage = useCallback((clientNonce: string) => {
    const input = pendingInputsRef.current.get(clientNonce);
    pendingInputsRef.current.delete(clientNonce);
    if (input?.attachment) URL.revokeObjectURL(input.attachment.previewUrl);
    setMessages((prev) => prev.filter((m) => m.clientNonce !== clientNonce));
  }, []);

  /** Remoção otimista: quem apaga não espera o próprio eco do SSE pra ver a mensagem sumir. */
  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMessages = useCallback(async (count: number): Promise<ClearMessagesResult> => {
    try {
      const response = await fetch('/api/chat/messages/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, count }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, error: data?.error };
      }
      const data = (await response.json()) as { deletedIds: string[] };
      const clearedIds = new Set(data.deletedIds);
      setMessages((prev) => prev.filter((m) => !clearedIds.has(m.id)));
      return { ok: true, count: data.deletedIds.length };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  }, [channelId]);

  const retryMessage = useCallback(
    (clientNonce: string) => {
      const input = pendingInputsRef.current.get(clientNonce);
      if (!input) return Promise.resolve<SendMessageResult>({ ok: false, error: 'NOT_FOUND' });
      pendingInputsRef.current.delete(clientNonce);
      setMessages((prev) => prev.filter((m) => m.clientNonce !== clientNonce));
      return sendMessage(input);
    },
    [sendMessage],
  );

  return {
    messages,
    loadingInitial,
    loadingOlder,
    hasMore,
    blocked,
    loadOlder,
    sendMessage,
    retryMessage,
    discardMessage,
    removeMessage,
    clearMessages,
  };
}
