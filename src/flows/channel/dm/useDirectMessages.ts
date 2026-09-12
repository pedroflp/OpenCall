'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BaseMessageDTO } from '@/lib/chat/dto';
import { subscribeToDmConnection, subscribeToDmResync } from '@/lib/dm/realtime';
import type { DmEvent } from '@/lib/dm/signal';
import type { ClientMessage, CurrentUser, SendMessageInput, SendMessageResult } from '@/flows/channel/text/types';

const UPLOADS_URL = '/api/chat/uploads';

function messagesUrl(conversationId: string): string {
  return `/api/dm/messages?conversationId=${encodeURIComponent(conversationId)}`;
}

/** XMLHttpRequest, não fetch: única API do browser com progresso de upload (ver useChatMessages.ts do canal geral). */
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

/** Best-effort: upload terminou mas a mensagem nunca foi criada — nunca deixa a UI esperando por isso. */
function deleteOrphanAttachment(key: string): void {
  fetch(`${UPLOADS_URL}?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
}

function sortByCreatedAt(messages: ClientMessage[]): ClientMessage[] {
  return [...messages].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/** Mesmo dedupe de useChatMessages.ts — mensagem real (POST ou SSE, o que chegar primeiro) nunca duplica. */
function upsertFromServer(prev: ClientMessage[], dto: BaseMessageDTO, clientNonce?: string): ClientMessage[] {
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
  messages: BaseMessageDTO[];
  nextCursor: string | null;
}

/**
 * Espelha useChatMessages.ts (canal geral) — mesmo tamanho e forma, mirando
 * os endpoints de DM. Sem mentionedUserIds/blocked/clearMessages: não
 * existem em DM.
 */
export function useDirectMessages(conversationId: string, currentUser: CurrentUser | null) {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextCursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingInputsRef = useRef<Map<string, SendMessageInput>>(new Map());

  const loadInitial = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const response = await fetch(messagesUrl(conversationId));
      if (!response.ok) return;
      const data = (await response.json()) as MessagesPage;
      setMessages(sortByCreatedAt(data.messages.map((message) => ({ ...message, status: 'sent' as const }))));
      nextCursorRef.current = data.nextCursor;
      setHasMore(Boolean(data.nextCursor));
    } finally {
      setLoadingInitial(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!nextCursorRef.current || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const response = await fetch(`${messagesUrl(conversationId)}&cursor=${encodeURIComponent(nextCursorRef.current)}`);
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
  }, [conversationId]);

  const resync = useCallback(async () => {
    try {
      const response = await fetch(messagesUrl(conversationId));
      if (!response.ok) return;
      const data = (await response.json()) as MessagesPage;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = data.messages.filter((m) => !existingIds.has(m.id)).map((m) => ({ ...m, status: 'sent' as const }));
        return fresh.length === 0 ? prev : sortByCreatedAt([...prev, ...fresh]);
      });
    } catch {
      // Próxima reconexão tenta de novo.
    }
  }, [conversationId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // O stream /api/dm/events cobre TODAS as conversas do usuário — filtra
  // pela conversa aberta, senão um evento de outra conversa vazaria pra cá.
  useEffect(() => {
    return subscribeToDmConnection((event: DmEvent) => {
      if (event.conversationId !== conversationId) return;
      if (event.type === 'message') {
        setMessages((prev) => upsertFromServer(prev, event.message, event.clientNonce));
      } else if (event.type === 'deleted') {
        setMessages((prev) => prev.filter((m) => m.id !== event.id));
      }
    });
  }, [conversationId]);

  useEffect(() => subscribeToDmResync(() => void resync()), [resync]);

  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<SendMessageResult> => {
      if (!currentUser) return { ok: false, error: 'UNAUTHENTICATED' };

      const clientNonce = crypto.randomUUID();
      pendingInputsRef.current.set(clientNonce, input);
      const optimistic: ClientMessage = {
        id: clientNonce,
        content: input.content,
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

      let uploadedKey: string | null = null;

      try {
        if (input.attachment) {
          const uploaded = await uploadAttachmentFile(input.attachment.file, trackProgress);
          uploadedKey = uploaded.key;
        }

        const response = await fetch('/api/dm/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            content: input.content,
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
            clientNonce,
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string; retryAfterMs?: number } | null;
          if (uploadedKey) deleteOrphanAttachment(uploadedKey);
          setMessages((prev) => prev.map((m) => (m.clientNonce === clientNonce ? { ...m, status: 'error' } : m)));
          return { ok: false, error: data?.error, retryAfterMs: data?.retryAfterMs };
        }

        const dto = (await response.json()) as BaseMessageDTO & { clientNonce: string };
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
    [conversationId, currentUser],
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
    loadOlder,
    sendMessage,
    retryMessage,
    discardMessage,
    removeMessage,
  };
}
