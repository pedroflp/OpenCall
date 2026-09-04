'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import EmojiPickerPopover from '@/components/EmojiPicker/EmojiPickerPopover';
import GifPickerPopover from './GifPickerPopover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Avatar from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { CLEAR_COMMAND_MAX_COUNT, MESSAGE_MAX_LENGTH } from '@/lib/chat/channel';
import { replyExcerpt } from '@/lib/chat/replyExcerpt';
import { usePlatformPresenceUsers } from '@/hooks/usePlatformPresenceUsers';
import type { PlatformPresenceUser } from '@/lib/presence/platformPresence';
import { HugeIcon } from '@/components/HugeIcon';
import { ATTACHMENT_KIND_ICON, formatBytes, MAX_ATTACHMENT_BYTES } from '@/lib/chat/attachments';
import { useLocale, useTranslations } from 'next-intl';
import { fileIconFor, formatDuration } from './media/format';
import type { PendingAttachment } from './useChatAttachment';
import type { ClientMessage, CurrentUser, SendMessageInput, SendMessageResult } from './types';
import { useAttachmentKindLabel } from './useAttachmentKindLabel';

const TEXTAREA_MAX_LINES = 8;
const TYPING_THROTTLE_MS = 3_000;
const MENTION_LIST_RE = /(?:^|\s)@([a-z0-9._]*)$/i;

interface SlashCommand {
  name: string;
  usage: string;
  /** Chave em `chat.composer` — a lista é constante, quem traduz é o menu. */
  description: 'clearCommandDescription';
}

/** Só o /clear por enquanto — lista cresce aqui conforme comandos novos entrarem. */
const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', usage: '/clear <número>', description: 'clearCommandDescription' },
];

const CLEAR_PREFIX_RE = /^\/clear(?:\s|$)/i;

/** Ainda compondo o nome do comando (sem espaço depois da barra) — dispara a lista. */
function matchCommandPrefix(text: string): string | null {
  const match = /^\/([a-z]*)$/i.exec(text);
  return match ? match[1].toLowerCase() : null;
}

/** /clear reconhecido, com ou sem o número já digitado. */
function matchClearCommand(text: string): number | null {
  const match = /^\/clear(?:\s+(\d+))?\s*$/i.exec(text);
  if (!match) return null;
  return match[1] ? Number(match[1]) : NaN;
}

interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

/** "@" em início de palavra (começo do texto ou depois de espaço) ainda sem espaço depois — dispara a lista de menção. */
function findMentionTrigger(text: string, caret: number): MentionTrigger | null {
  const upToCaret = text.slice(0, caret);
  const match = MENTION_LIST_RE.exec(upToCaret);
  if (!match) return null;
  const query = match[1];
  return { start: caret - query.length - 1, end: caret, query };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Preview otimista da citação — o servidor recalcula o mesmo excerpt em toMessageDTO. */
function replyPreviewFor(target: ClientMessage | null): SendMessageInput['replyToPreview'] {
  if (!target) return null;
  return {
    id: target.id,
    // Mesmo id que o DTO do servidor manda — a citação otimista precisa dele
    // pra também reagir ao evento `profile`, senão ela é a única linha da tela
    // com o nome antigo.
    authorId: target.author.id,
    authorUsername: target.author.username,
    authorAvatar: target.author.avatar,
    excerpt: replyExcerpt(target.content),
    attachmentKind: target.attachment?.kind ?? null,
  };
}

function ReplyBar({ target, onCancel }: { target: ClientMessage; onCancel: () => void }) {
  const t = useTranslations('chat.composer');
  const tKind = useAttachmentKindLabel();

  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2 text-xs">
      <HugeIcon name="arrow-turn-backward" size={16} className="shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        {t('replyingTo')} <span className="font-semibold text-foreground">{target.author.username}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
        {target.attachment && !target.content ? (
          <>
            <HugeIcon name={ATTACHMENT_KIND_ICON[target.attachment.kind]} size={12} className="shrink-0" />
            <span className="shrink-0">{tKind(target.attachment.kind)}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{target.content}</span>
        )}
      </span>
      <button type="button" onClick={onCancel} aria-label={t('cancelReply')} className="shrink-0 text-muted-foreground hover:text-foreground">
        <HugeIcon name="cancel-01" size={14} />
      </button>
    </div>
  );
}

/** Miniatura real pra imagem e vídeo (o `blob:` já está na mão), ícone da espécie pro resto. */
function AttachmentThumbnail({ attachment }: { attachment: PendingAttachment }) {
  if (attachment.kind === 'IMAGE') {
    // eslint-disable-next-line @next/next/no-img-element -- preview local (blob:), next/image não aceita blob URL.
    return <img src={attachment.previewUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />;
  }

  if (attachment.kind === 'VIDEO') {
    return (
      <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-black">
        <video src={attachment.previewUrl} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
          <HugeIcon name="play" size={14} />
        </span>
      </span>
    );
  }

  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background/70 text-muted-foreground">
      <HugeIcon name={attachment.kind === 'AUDIO' ? 'music-note-01' : fileIconFor(attachment.file.name)} size={20} />
    </span>
  );
}

function AttachmentPreview({ attachment, onRemove }: { attachment: PendingAttachment; onRemove: () => void }) {
  const t = useTranslations('chat.composer');
  const tKind = useAttachmentKindLabel();
  const locale = useLocale();

  const details = [
    tKind(attachment.kind),
    formatBytes(attachment.file.size, locale),
    attachment.durationMs ? formatDuration(attachment.durationMs / 1000) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-3.5 py-2">
      <AttachmentThumbnail attachment={attachment} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{attachment.file.name}</div>
        {attachment.status === 'error' ? (
          <div className="mt-0.5 text-xs text-destructive">
            {t('attachmentTooLarge', {
              kind: tKind(attachment.kind),
              max: formatBytes(MAX_ATTACHMENT_BYTES[attachment.kind], locale),
            })}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{attachment.status === 'reading' ? t('readingFile') : details}</div>
        )}
      </div>

      <button type="button" onClick={onRemove} aria-label={t('removeAttachment')} className="shrink-0 text-muted-foreground hover:text-foreground">
        <HugeIcon name="cancel-01" size={16} />
      </button>
    </div>
  );
}

export default function MessageComposer({
  channelId,
  onSend,
  replyTarget,
  onCancelReply,
  attachment,
  gifPickerEnabled,
  onAttachFile,
  onRemoveAttachment,
  onAttachmentSent,
  canClear,
  onClear,
  blocked,
  currentUser,
}: {
  channelId: string;
  onSend: (input: SendMessageInput) => Promise<SendMessageResult>;
  replyTarget: ClientMessage | null;
  onCancelReply: () => void;
  attachment: PendingAttachment | null;
  /** false quando o servidor não tem GIPHY_API_KEY — o botão de GIF some em vez de abrir um popover que só sabe falhar. */
  gifPickerEnabled: boolean;
  onAttachFile: (file: File) => void;
  onRemoveAttachment: () => void;
  onAttachmentSent: () => void;
  canClear: boolean;
  onClear: (count: number) => Promise<void>;
  blocked: boolean;
  currentUser: CurrentUser;
}) {
  const t = useTranslations('chat.composer');
  const [text, setText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [caretPosition, setCaretPosition] = useState(0);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextTypingAtRef = useRef(0);
  // username -> id de quem foi selecionado na lista de menção nesta composição —
  // só isso vira @menção de verdade no envio (ver extractMentions), digitar
  // "@nome" sem escolher da lista não marca ninguém.
  const pickedMentionsRef = useRef<Map<string, string>>(new Map());

  const { users: presenceUsers } = usePlatformPresenceUsers();

  const isRecognizedClear = canClear && CLEAR_PREFIX_RE.test(text);
  const commandPrefix = canClear && !isRecognizedClear ? matchCommandPrefix(text) : null;
  const matchingCommands = useMemo(
    () => (commandPrefix !== null ? SLASH_COMMANDS.filter((command) => command.name.startsWith(commandPrefix)) : []),
    [commandPrefix],
  );
  const showCommandMenu = matchingCommands.length > 0;

  const clearCount = canClear ? matchClearCommand(text) : null;
  const isClearCommand = clearCount !== null;

  const mentionTrigger = useMemo(() => findMentionTrigger(text, caretPosition), [text, caretPosition]);
  const mentionTriggerKey = mentionTrigger ? `${mentionTrigger.start}:${mentionTrigger.query}` : null;
  const matchingUsers = useMemo(() => {
    if (!mentionTrigger) return [];
    const query = mentionTrigger.query.toLowerCase();
    return presenceUsers
      .filter((user) => user.id !== currentUser.id && user.username.toLowerCase().startsWith(query))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [mentionTrigger, presenceUsers, currentUser.id]);
  const showMentionMenu = matchingUsers.length > 0 && mentionTriggerKey !== dismissedMentionKey;
  const activeMentionIndex = showMentionMenu ? Math.min(mentionSelectedIndex, matchingUsers.length - 1) : 0;
  const mentionItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionTriggerKey]);

  useEffect(() => {
    if (!showMentionMenu) return;
    mentionItemRefs.current[activeMentionIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeMentionIndex, showMentionMenu]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now < nextTypingAtRef.current) return;
    nextTypingAtRef.current = now + TYPING_THROTTLE_MS;
    fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    }).catch(() => { });
  }, [channelId]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20');
    const maxHeight = lineHeight * TEXTAREA_MAX_LINES;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  /** Só vira @menção quem foi de fato escolhido na lista E cujo "@username" ainda está no texto final — apagar depois de escolher não marca ninguém. */
  const extractMentions = useCallback(
    (finalContent: string): SendMessageInput['mentions'] => {
      if (pickedMentionsRef.current.size === 0) return [];
      const usernames = [...pickedMentionsRef.current.keys()].map(escapeRegExp);
      const pattern = new RegExp(`@(${usernames.join('|')})\\b`, 'g');
      const ids = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(finalContent))) {
        const id = pickedMentionsRef.current.get(match[1]);
        if (id) ids.add(id);
      }
      return presenceUsers.filter((user) => ids.has(user.id)).map((user) => ({ id: user.id, username: user.username, avatar: user.avatar }));
    },
    [presenceUsers],
  );

  /** Acima do teto, clampa pro máximo em vez de invalidar o comando — ver CLEAR_COMMAND_MAX_COUNT. */
  const validClearCount =
    clearCount !== null && Number.isFinite(clearCount) && clearCount > 0 ? Math.min(clearCount, CLEAR_COMMAND_MAX_COUNT) : null;

  const canSend = isClearCommand
    ? validClearCount !== null && !clearing
    : (text.trim().length > 0 || attachment?.status === 'ready') && attachment?.status !== 'reading';

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    if (isClearCommand) {
      if (validClearCount === null) return;
      setText('');
      requestAnimationFrame(resizeTextarea);
      setClearing(true);
      try {
        await onClear(validClearCount);
      } finally {
        setClearing(false);
      }
      return;
    }

    const content = text.trim() || null;
    const mentions = content ? extractMentions(content) : [];
    const upload: SendMessageInput['attachment'] =
      attachment?.status === 'ready'
        ? {
            file: attachment.file,
            kind: attachment.kind,
            previewUrl: attachment.previewUrl,
            width: attachment.width,
            height: attachment.height,
            durationMs: attachment.durationMs,
          }
        : null;

    setText('');
    pickedMentionsRef.current.clear();
    // Anexo válido: a posse do preview (blob:) passa pro envio, que revoga
    // quando a mensagem for confirmada ou descartada (ver useChatMessages).
    // Sem anexo válido (nulo ou erro): remove normalmente, revogando aqui.
    if (upload) onAttachmentSent();
    else if (attachment) onRemoveAttachment();
    onCancelReply();
    requestAnimationFrame(resizeTextarea);

    await onSend({
      content,
      attachment: upload,
      replyToId: replyTarget?.id ?? null,
      replyToPreview: replyPreviewFor(replyTarget),
      mentions,
    });
  }, [
    canSend,
    isClearCommand,
    validClearCount,
    onClear,
    text,
    extractMentions,
    attachment,
    replyTarget,
    onSend,
    onRemoveAttachment,
    onAttachmentSent,
    onCancelReply,
    resizeTextarea,
  ]);

  /** GIF escolhido no popover vai direto como mensagem — a URL é o conteúdo, e o render reconhece e mostra o GIF (ver gifUrl.ts). */
  const handleSendGif = useCallback(
    async (url: string) => {
      const target = replyTarget;
      onCancelReply();
      await onSend({ content: url, attachment: null, replyToId: target?.id ?? null, replyToPreview: replyPreviewFor(target), mentions: [] });
    },
    [replyTarget, onCancelReply, onSend],
  );

  /** Emoji escolhido no picker vai pro texto, na posição do cursor — igual a inserir um caractere digitado. */
  const insertEmoji = useCallback(
    (emoji: string) => {
      const before = text.slice(0, caretPosition);
      const after = text.slice(caretPosition);
      const nextText = `${before}${emoji}${after}`.slice(0, MESSAGE_MAX_LENGTH);
      const caret = Math.min(before.length + emoji.length, nextText.length);

      setText(nextText);
      setCaretPosition(caret);

      requestAnimationFrame(() => {
        resizeTextarea();
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [text, caretPosition, resizeTextarea],
  );

  const selectCommand = useCallback((command: SlashCommand) => {
    const nextText = `/${command.name} `;
    setText(nextText);
    setCaretPosition(nextText.length);
    requestAnimationFrame(() => {
      resizeTextarea();
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextText.length, nextText.length);
    });
  }, [resizeTextarea]);

  const insertMention = useCallback(
    (user: PlatformPresenceUser) => {
      if (!mentionTrigger) return;
      const before = text.slice(0, mentionTrigger.start);
      const after = text.slice(mentionTrigger.end);
      const insertion = `@${user.username} `;
      const nextText = `${before}${insertion}${after}`.slice(0, MESSAGE_MAX_LENGTH);
      const caret = Math.min(before.length + insertion.length, nextText.length);

      pickedMentionsRef.current.set(user.username, user.id);
      setText(nextText);
      setCaretPosition(caret);
      setDismissedMentionKey(null);

      requestAnimationFrame(() => {
        resizeTextarea();
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [mentionTrigger, text, resizeTextarea],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentionMenu) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setMentionSelectedIndex((index) => Math.min(index + 1, matchingUsers.length - 1));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionSelectedIndex((index) => Math.max(index - 1, 0));
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          insertMention(matchingUsers[activeMentionIndex]);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setDismissedMentionKey(mentionTriggerKey);
          return;
        }
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (showCommandMenu && matchingCommands.length > 0) {
          selectCommand(matchingCommands[0]);
          return;
        }
        void handleSend();
      }
    },
    [handleSend, showCommandMenu, matchingCommands, selectCommand, showMentionMenu, matchingUsers, activeMentionIndex, insertMention, mentionTriggerKey],
  );

  /** Colar arquivo do sistema anexa; colar texto continua colando texto (`files` só vem preenchido no primeiro caso). */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const file = event.clipboardData.files[0];
      if (!file) return;
      event.preventDefault();
      onAttachFile(file);
    },
    [onAttachFile],
  );

  if (blocked) {
    return (
      <div className="shrink-0 px-6 pb-5">
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-muted-foreground">
          <HugeIcon name="square-lock-01" size={20} className="shrink-0" />
          <span className="text-[14.5px]">{t('blocked')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-6 pb-5">
      <Popover open={showCommandMenu || showMentionMenu}>
        <PopoverAnchor asChild>
          <div className="rounded-xl bg-muted/50">
            {replyTarget && <ReplyBar target={replyTarget} onCancel={onCancelReply} />}
            {attachment && <AttachmentPreview attachment={attachment} onRemove={onRemoveAttachment} />}

            <div className="flex items-start gap-2.5 px-3.5 py-2.5">
              <button
                type="button"
                aria-label={t('attachFile')}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <HugeIcon name="attachment-01" size={22} />
              </button>
              {/* Sem `accept`: qualquer arquivo entra, e a espécie é decidida
                  pelos bytes no servidor (ver ADR-0013). */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onAttachFile(file);
                  event.target.value = '';
                }}
              />

              <div className="relative min-w-0 flex-1">
                {isRecognizedClear && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words py-0.5 text-[14.5px] leading-[22px]"
                  >
                    <span className="font-semibold text-primary">/clear</span>
                    {text.slice(6)}
                  </div>
                )}

                {/* Enter envia; enterKeyHint cobre teclado virtual mobile. */}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(event) => {
                    const nextValue = event.target.value.slice(0, MESSAGE_MAX_LENGTH);
                    setText(nextValue);
                    setCaretPosition(Math.min(event.target.selectionStart, nextValue.length));
                    resizeTextarea();
                    if (event.target.value.trim()) notifyTyping();
                  }}
                  onKeyDown={handleKeyDown}
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      setCaretPosition(event.currentTarget.selectionStart);
                    }
                  }}
                  onClick={(event) => setCaretPosition(event.currentTarget.selectionStart)}
                  onPaste={handlePaste}
                  rows={1}
                  enterKeyHint="send"
                  placeholder={t('placeholder')}
                  className={cn(
                    'max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[14.5px] leading-[22px] placeholder:text-muted-foreground focus:outline-none',
                    isRecognizedClear && 'text-transparent caret-foreground',
                  )}
                />
              </div>

              <EmojiPickerPopover onSelect={insertEmoji} side="top" align="end">
                <button
                  type="button"
                  aria-label={t('insertEmoji')}
                  className="shrink-0 text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
                >
                  <HugeIcon name="smile" size={20} />
                </button>
              </EmojiPickerPopover>

              {gifPickerEnabled && <GifPickerPopover onPick={(url) => void handleSendGif(url)} />}

              {canSend && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('sendMessage')}
                        onClick={() => void handleSend()}
                        className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <HugeIcon name="arrow-up-01" size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('sendMessage')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </PopoverAnchor>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-72 p-1.5"
        >
          {showMentionMenu ? (
            <div className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('mention')}
              </div>
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {matchingUsers.map((user, index) => (
                  <button
                    key={user.id}
                    ref={(el) => {
                      mentionItemRefs.current[index] = el;
                    }}
                    type="button"
                    onClick={() => insertMention(user)}
                    onMouseEnter={() => setMentionSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
                      index === activeMentionIndex ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <Avatar image={user.avatar} fallback={user.username.slice(0, 2)} size={7} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{user.username}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            matchingCommands.map((command) => (
              <button
                key={command.name}
                type="button"
                onClick={() => selectCommand(command)}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted"
              >
                <HugeIcon name="delete-02" size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">
                    <span className="text-primary">/{command.name}</span> {command.usage.replace(`/${command.name}`, '').trim()}
                  </div>
                  <div className="text-xs text-muted-foreground">{t(command.description)}</div>
                </div>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
