'use client';

import { useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import AvatarCircleSmall from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { avatarColorFor } from './avatarColor';
import { HugeIcon } from '@/components/HugeIcon';
import { MessageContent } from './messageContent';
import type { ClientMessage } from './types';


function AvatarCircle({ userId, username, avatar }: { userId: string; username: string; avatar: string }) {
  return (
    <Avatar className="mt-0.5 size-[38px] shrink-0">
      <AvatarImage src={avatar} alt="" />
      <AvatarFallback
        className="text-sm font-bold text-white"
        style={{ background: avatarColorFor(userId) }}
      >
        {username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Mesma estrutura do MessageItem real (avatar 38px, header username+hora, linhas de conteúdo) — só os miolos viram placeholder. */
export function MessageItemSkeleton({ grouped, lines }: { grouped?: boolean; lines: string[] }) {
  return (
    <div className={cn('flex gap-3 rounded-lg px-2', grouped ? 'py-1' : 'pt-2')}>
      <div className="w-[38px] shrink-0">{!grouped && <div className="mt-0.5 size-[38px] shrink-0 rounded-full bg-muted/60" />}</div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <div className="h-3.5 w-28 rounded-md bg-muted/60" />
            <div className="h-3 w-9 rounded-md bg-muted/50" />
          </div>
        )}
        <div className={cn('flex flex-col gap-1.5', !grouped && 'mt-1.5')}>
          {lines.map((width, index) => (
            <div key={index} className="h-3.5 rounded-md bg-muted/50" style={{ width }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReplyPreviewStrip({ replyTo, onClick }: { replyTo: NonNullable<ClientMessage['replyTo']>; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-1 mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground">
      <HugeIcon name="arrow-turn-backward" size={16} className="shrink-0" />
      <AvatarCircleSmall image={replyTo.authorAvatar} fallback={replyTo.authorUsername.slice(0, 2)} size={4} className="shrink-0" />
      <span className="shrink-0 text-[12.5px] font-semibold text-foreground/75">{replyTo.authorUsername}</span>
      {/* O truncate precisa ficar no elemento de texto, não no flex container: em flex o text-overflow não
          se aplica ao conteúdo anônimo e a citação termina cortada no seco, sem reticências. */}
      <span className="flex min-w-0 max-w-[280px] items-center gap-1 text-[12.5px] text-muted-foreground">
        {replyTo.hasImage ? (
          <>
            <HugeIcon name="image-01" size={12} className="shrink-0" />
            <span className="shrink-0">Imagem</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{replyTo.excerpt}</span>
        )}
      </span>
    </button>
  );
}

function UnavailableReplyStrip() {
  return (
    <div className="mb-1 mt-0.5 flex items-center gap-1.5 text-[12.5px] italic text-muted-foreground/60">
      <HugeIcon name="arrow-turn-backward" size={16} className="shrink-0" />
      mensagem indisponível
    </div>
  );
}

function ImageBubble({ image, hasText, onClick }: { image: NonNullable<ClientMessage['image']>; hasText: boolean; onClick: () => void }) {
  const [optimizerFailed, setOptimizerFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('block w-[320px] max-w-full overflow-hidden rounded-[10px] border border-border/50 bg-muted/40', hasText ? 'mt-1.5' : 'mt-1')}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    >
      <Image
        src={image.url}
        alt=""
        width={image.width}
        height={image.height}
        loading="lazy"
        sizes="320px"
        className="h-full w-full object-cover"
        unoptimized={optimizerFailed}
        onError={() => setOptimizerFailed(true)}
      />
    </button>
  );
}

/** Responder fica atalho aqui fora e continua também dentro do popover — quem já conhece o menu não perde o caminho. */
function MessageActions({
  canDelete,
  onReply,
  onDelete,
}: {
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute right-1.5 top-0.5 flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Responder"
            onClick={onReply}
            className="flex size-[26px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <HugeIcon name="arrow-turn-backward" size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Responder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Mais opções"
                className="flex size-[26px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <HugeIcon name="more-vertical" size={16} />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[220px] border-border bg-popover p-1 shadow-2xl">
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações da mensagem</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onReply();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] font-semibold hover:bg-muted"
        >
          <HugeIcon name="arrow-turn-backward" size={15} />
          Responder
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] font-semibold text-destructive hover:bg-destructive/10"
          >
            <HugeIcon name="delete-02" size={16} />
            Excluir mensagem
          </button>
        )}
          </PopoverContent>
        </Popover>
        <TooltipContent>Mais opções</TooltipContent>
      </Tooltip>
    </div>
  );
}

function MessageStatusBar({ onRetry, onDiscard }: { onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
      <span>Falha ao enviar</span>
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
        reenviar
      </button>
      <button type="button" onClick={onDiscard} className="font-semibold underline underline-offset-2">
        descartar
      </button>
    </div>
  );
}

export default function MessageItem({
  message,
  grouped,
  currentUserId,
  canDelete,
  onReply,
  onDelete,
  onImageClick,
  onReplyPreviewClick,
  onRetry,
  onDiscard,
  registerRef,
}: {
  message: ClientMessage;
  grouped: boolean;
  currentUserId: string | null;
  canDelete: boolean;
  onReply: (message: ClientMessage) => void;
  onDelete: (message: ClientMessage) => void;
  onImageClick: (image: NonNullable<ClientMessage['image']>) => void;
  onReplyPreviewClick: (replyToId: string) => void;
  onRetry: (message: ClientMessage) => void;
  onDiscard: (message: ClientMessage) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const time = format(new Date(message.createdAt), 'HH:mm', { locale: ptBR });
  const fullDate = format(new Date(message.createdAt), "d 'de' MMMM 'às' HH:mm", { locale: ptBR });
  const isPending = message.status === 'sending';
  const isError = message.status === 'error';
  const isSent = message.status === 'sent';
  const mentionsMe = currentUserId !== null && message.mentions.some((mention) => mention.id === currentUserId);

  return (
    <div
      ref={(el) => registerRef(message.id, el)}
      data-message-id={message.id}
      className={cn(
        'group relative flex gap-3 rounded-xl px-2',
        mentionsMe ? 'bg-primary/10 hover:bg-primary/15 w-80% ml-auto' : 'hover:bg-muted/25',
        grouped ? 'py-1' : 'py-2',
        isPending && 'opacity-60',
      )}
    >
      <div className="w-[38px] shrink-0">
        {!grouped && <AvatarCircle userId={message.author.id} username={message.author.username} avatar={message.author.avatar} />}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[14.5px] font-bold">{message.author.username}</span>
            <span title={fullDate} className="shrink-0 whitespace-nowrap text-[11.5px] text-muted-foreground">
              {time}
            </span>
          </div>
        )}

        {message.replyTo ? (
          <ReplyPreviewStrip replyTo={message.replyTo} onClick={() => onReplyPreviewClick(message.replyTo!.id)} />
        ) : message.hasReply ? (
          <UnavailableReplyStrip />
        ) : null}

        {message.content && <MessageContent content={message.content} mentions={message.mentions} />}
        {message.image && <ImageBubble image={message.image} hasText={Boolean(message.content)} onClick={() => onImageClick(message.image!)} />}
        {isError && <MessageStatusBar onRetry={() => onRetry(message)} onDiscard={() => onDiscard(message)} />}
      </div>

      {isSent && <MessageActions canDelete={canDelete} onReply={() => onReply(message)} onDelete={() => onDelete(message)} />}
    </div>
  );
}
