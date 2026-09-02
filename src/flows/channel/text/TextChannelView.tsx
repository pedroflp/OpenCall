'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Link } from 'next-view-transitions';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { subscribeToChatConnection } from '@/lib/chat/realtime';
import type { ChatEvent } from '@/lib/chat/signal';
import type { UserAuthDTO } from '@/app/api/auth/[...nextauth]/types';
import { routeNames } from '@/app/route.names';
import ImageLightbox from './ImageLightbox';
import MessageComposer from './MessageComposer';
import MessageList from './MessageList';
import TypingIndicator from './TypingIndicator';
import { useChatMessages } from './useChatMessages';
import { useChatAttachment } from './useChatAttachment';
import type { ClientMessage } from './types';

const TYPING_EXPIRY_MS = 6_000;

export default function TextChannelView({
  gifPickerEnabled,
  channelId,
  channelName,
  user,
}: {
  /** Vem do servidor (ver flows/channel/text/index.tsx): sem GIPHY_API_KEY o botão de GIF não aparece. */
  gifPickerEnabled: boolean;
  channelId: string;
  channelName: string;
  user: UserAuthDTO;
}) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const canDeleteAny = Boolean(session?.user?.isChannelsAdmin);

  const currentUser = { id: user.id, username: user.username, avatar: user.avatar };
  const { messages, loadingInitial, loadingOlder, hasMore, blocked, loadOlder, sendMessage, retryMessage, discardMessage, removeMessage, clearMessages } =
    useChatMessages(channelId, currentUser);
  const { attachment, startAttach, retry: retryAttachment, clear: clearAttachment, release: releaseAttachment } = useChatAttachment();

  const [replyTarget, setReplyTarget] = useState<ClientMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<NonNullable<ClientMessage['image']> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ id: string; username: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const typingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return subscribeToChatConnection((event: ChatEvent) => {
      if (event.type !== 'typing' || event.channelId !== channelId) return;

      const existing = typingTimeoutsRef.current.get(event.user.id);
      if (existing) clearTimeout(existing);

      setTypingUsers((prev) => (prev.some((u) => u.id === event.user.id) ? prev : [...prev, event.user]));

      typingTimeoutsRef.current.set(
        event.user.id,
        setTimeout(() => {
          typingTimeoutsRef.current.delete(event.user.id);
          setTypingUsers((prev) => prev.filter((u) => u.id !== event.user.id));
        }, TYPING_EXPIRY_MS),
      );
    });
  }, [channelId]);

  useEffect(() => {
    const timeouts = typingTimeoutsRef.current;
    return () => timeouts.forEach((timeout) => clearTimeout(timeout));
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) startAttach(file);
    },
    [startAttach],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/chat/messages/${deleteTarget.id}`, { method: 'DELETE' });
      if (response.ok || response.status === 404) {
        removeMessage(deleteTarget.id);
      } else {
        toast({ title: 'Não deu pra apagar a mensagem', description: 'Tenta de novo.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Não deu pra apagar a mensagem', description: 'Verifica sua conexão e tenta de novo.', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast, removeMessage]);

  const handleClear = useCallback(
    async (count: number) => {
      const result = await clearMessages(count);
      if (!result.ok) {
        toast({ title: 'Não deu pra apagar as mensagens', description: 'Tenta de novo.', variant: 'destructive' });
        return;
      }
      const deleted = result.count ?? 0;
      if (deleted === 0) return;
      toast({ title: deleted === 1 ? 'A última mensagem foi apagada' : `As ${deleted} últimas mensagens foram apagadas` });
    },
    [clearMessages, toast],
  );

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col bg-background"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/40 px-[18px] shadow-[0_1px_0_rgba(0,0,0,0.2)]">
        <Link
          href={routeNames.CHANNELS}
          aria-label="Voltar"
          className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground min-[900px]:hidden"
        >
          <HugeIcon name="arrow-left-01" size={19} />
        </Link>
        <HugeIcon name="hashtag" size={19} className="shrink-0 text-muted-foreground" />
        <span className="text-md font-bold">{channelName}</span>
      </div>

      <MessageList
        channelId={channelId}
        messages={messages}
        loadingInitial={loadingInitial}
        loadingOlder={loadingOlder}
        hasMore={hasMore}
        onLoadOlder={loadOlder}
        currentUserId={currentUser.id}
        canDeleteAny={canDeleteAny}
        onReply={setReplyTarget}
        onDelete={setDeleteTarget}
        onImageClick={setLightboxImage}
        onRetry={retryMessage}
        onDiscard={discardMessage}
      />

      <TypingIndicator users={typingUsers} />

      <MessageComposer
          gifPickerEnabled={gifPickerEnabled}
        channelId={channelId}
        onSend={sendMessage}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        attachment={attachment}
        onAttachFile={startAttach}
        onRemoveAttachment={clearAttachment}
        onRetryAttachment={retryAttachment}
        onAttachmentSent={releaseAttachment}
        currentUser={currentUser}
        canClear={canDeleteAny}
        onClear={handleClear}
        blocked={blocked}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
          <p className="text-lg font-semibold text-primary">Solte a imagem aqui</p>
        </div>
      )}

      {lightboxImage && <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar mensagem?</DialogTitle>
            <DialogDescription>Isso não pode ser desfeito. A mensagem some pra todo mundo no canal.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" loading={deleting} onClick={() => void confirmDelete()}>
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
