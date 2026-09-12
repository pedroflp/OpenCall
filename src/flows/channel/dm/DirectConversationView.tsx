'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'next-view-transitions';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { subscribeToDmConnection } from '@/lib/dm/realtime';
import type { DmEvent } from '@/lib/dm/signal';
import type { AttachmentDTO } from '@/lib/chat/dto';
import { routeNames } from '@/app/route.names';
import ImageLightbox from '@/flows/channel/text/ImageLightbox';
import MessageComposer from '@/flows/channel/text/MessageComposer';
import MessageList from '@/flows/channel/text/MessageList';
import TypingIndicator from '@/flows/channel/text/TypingIndicator';
import { useChatAttachment } from '@/flows/channel/text/useChatAttachment';
import type { ClientMessage, CurrentUser } from '@/flows/channel/text/types';
import { useDirectMessages } from './useDirectMessages';
import { markDmRead } from '@/hooks/useDirectConversations';

const TYPING_EXPIRY_MS = 6_000;

export default function DirectConversationView({
  gifPickerEnabled,
  conversationId,
  otherParticipant,
  currentUser,
}: {
  /** Vem do servidor: sem GIPHY_API_KEY o botão de GIF não aparece (mesmo flag do chat de canal). */
  gifPickerEnabled: boolean;
  conversationId: string;
  otherParticipant: { id: string; username: string; avatar: string };
  currentUser: CurrentUser;
}) {
  const t = useTranslations('dm.view');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { messages, loadingInitial, loadingOlder, hasMore, loadOlder, sendMessage, retryMessage, discardMessage, removeMessage } =
    useDirectMessages(conversationId, currentUser);
  const { attachment, startAttach, clear: clearAttachment, release: releaseAttachment } = useChatAttachment();

  const [replyTarget, setReplyTarget] = useState<ClientMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<AttachmentDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ id: string; username: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const typingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return subscribeToDmConnection((event: DmEvent) => {
      if (event.type !== 'typing' || event.conversationId !== conversationId) return;

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
  }, [conversationId]);

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
      const response = await fetch(`/api/dm/messages/${deleteTarget.id}`, { method: 'DELETE' });
      if (response.ok || response.status === 404) {
        removeMessage(deleteTarget.id);
      } else {
        toast({ title: t('deleteFailed'), description: t('deleteFailedRetry'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('deleteFailed'), description: t('deleteFailedNetwork'), variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast, removeMessage, t]);

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
          aria-label={t('back')}
          className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground min-[900px]:hidden"
        >
          <HugeIcon name="arrow-left-01" size={19} />
        </Link>
        <Avatar image={otherParticipant.avatar} fallback={otherParticipant.username.slice(0, 2)} size={7} />
        <span className="text-md font-bold">{otherParticipant.username}</span>
      </div>

      <MessageList
        readEndpoint={`/api/dm/read?conversationId=${encodeURIComponent(conversationId)}`}
        onMarkRead={(messageId) => markDmRead(conversationId, messageId)}
        messages={messages}
        loadingInitial={loadingInitial}
        loadingOlder={loadingOlder}
        hasMore={hasMore}
        onLoadOlder={loadOlder}
        currentUserId={currentUser.id}
        canDeleteAny={false}
        onReply={setReplyTarget}
        onDelete={setDeleteTarget}
        onImageClick={setLightboxImage}
        onRetry={retryMessage}
        onDiscard={discardMessage}
      />

      <TypingIndicator users={typingUsers} />

      <MessageComposer
        gifPickerEnabled={gifPickerEnabled}
        allowMentions={false}
        onTypingNotify={() =>
          fetch('/api/dm/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId }),
          }).catch(() => {})
        }
        onSend={sendMessage}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        attachment={attachment}
        onAttachFile={startAttach}
        onRemoveAttachment={clearAttachment}
        onAttachmentSent={releaseAttachment}
        currentUser={currentUser}
        canClear={false}
        onClear={async () => {}}
        blocked={false}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
          <p className="text-lg font-semibold text-primary">{t('dropFileHere')}</p>
        </div>
      )}

      {lightboxImage && <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>{t('deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {tCommon('cancel')}
            </Button>
            <Button type="button" variant="destructive" loading={deleting} onClick={() => void confirmDelete()}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
