'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Avatar from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { CLEAR_COMMAND_MAX_COUNT, MESSAGE_MAX_LENGTH } from '@/lib/chat/channel';
import { usePlatformPresenceUsers } from '@/hooks/usePlatformPresenceUsers';
import type { PlatformPresenceUser } from '@/lib/presence/platformPresence';
import { HugeIcon } from '@/components/HugeIcon';
import type { PendingAttachment } from './useChatAttachment';
import type { ClientMessage, CurrentUser, SendMessageInput, SendMessageResult } from './types';

const TEXTAREA_MAX_LINES = 8;
const TYPING_THROTTLE_MS = 3_000;
const MENTION_LIST_RE = /(?:^|\s)@([a-z0-9._]*)$/i;

interface SlashCommand {
  name: string;
  usage: string;
  description: string;
}

/** Só o /clear por enquanto — lista cresce aqui conforme comandos novos entrarem. */
const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', usage: '/clear <número>', description: 'Apaga as últimas N mensagens do canal' },
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

function ReplyBar({ target, onCancel }: { target: ClientMessage; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2 text-xs">
      <HugeIcon name="arrow-turn-backward" size={16} className="shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        Respondendo <span className="font-semibold text-foreground">{target.author.username}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground">
        {target.image ? (
          <>
            <HugeIcon name="image-01" size={12} className="shrink-0" />
            Imagem
          </>
        ) : (
          target.content
        )}
      </span>
      <button type="button" onClick={onCancel} aria-label="Cancelar resposta" className="shrink-0 text-muted-foreground hover:text-foreground">
        <HugeIcon name="cancel-01" size={14} />
      </button>
    </div>
  );
}

function AttachmentPreview({ attachment, onRemove, onRetry }: { attachment: PendingAttachment; onRemove: () => void; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-3.5 py-2">
      {attachment.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- preview local (blob:), next/image não aceita blob URL.
        <img src={attachment.previewUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{attachment.file.name}</div>
        {attachment.status === 'error' && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-destructive">
            <span>{attachment.error === 'IMAGE_TOO_LARGE' ? 'Imagem maior que 10MB' : 'Imagem inválida'}</span>
            <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
              tentar de novo
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={onRemove} aria-label="Remover anexo" className="shrink-0 text-muted-foreground hover:text-foreground">
        <HugeIcon name="cancel-01" size={16} />
      </button>
    </div>
  );
}

export default function MessageComposer({
  onSend,
  replyTarget,
  onCancelReply,
  attachment,
  onAttachFile,
  onRemoveAttachment,
  onRetryAttachment,
  onAttachmentSent,
  canClear,
  onClear,
  blocked,
  currentUser,
}: {
  onSend: (input: SendMessageInput) => Promise<SendMessageResult>;
  replyTarget: ClientMessage | null;
  onCancelReply: () => void;
  attachment: PendingAttachment | null;
  onAttachFile: (file: File) => void;
  onRemoveAttachment: () => void;
  onRetryAttachment: () => void;
  onAttachmentSent: () => void;
  canClear: boolean;
  onClear: (count: number) => Promise<void>;
  blocked: boolean;
  currentUser: CurrentUser;
}) {
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
    fetch('/api/chat/typing', { method: 'POST' }).catch(() => { });
  }, []);

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
    const image = attachment?.status === 'ready' ? { file: attachment.file, previewUrl: attachment.previewUrl, width: attachment.width, height: attachment.height } : null;

    setText('');
    pickedMentionsRef.current.clear();
    // Anexo válido: a posse do preview (blob:) passa pro envio, que revoga
    // quando a mensagem for confirmada ou descartada (ver useChatMessages).
    // Sem anexo válido (nulo ou erro): remove normalmente, revogando aqui.
    if (image) onAttachmentSent();
    else if (attachment) onRemoveAttachment();
    onCancelReply();
    requestAnimationFrame(resizeTextarea);

    await onSend({
      content,
      image,
      replyToId: replyTarget?.id ?? null,
      replyToPreview: replyTarget
        ? {
            id: replyTarget.id,
            authorUsername: replyTarget.author.username,
            authorAvatar: replyTarget.author.avatar,
            excerpt: (replyTarget.content ?? '').slice(0, 120),
            hasImage: Boolean(replyTarget.image),
          }
        : null,
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

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
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
          <span className="text-[14.5px]">Um administrador bloqueou você de enviar mensagens</span>
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
            {attachment && <AttachmentPreview attachment={attachment} onRemove={onRemoveAttachment} onRetry={onRetryAttachment} />}

            <div className="flex items-start gap-2.5 px-3.5 py-2.5">
              <button
                type="button"
                aria-label="Anexar imagem"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <HugeIcon name="attachment-01" size={22} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
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
                  placeholder="Mensagem"
                  className={cn(
                    'max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[14.5px] leading-[22px] placeholder:text-muted-foreground focus:outline-none',
                    isRecognizedClear && 'text-transparent caret-foreground',
                  )}
                />
              </div>

              {canSend && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Enviar mensagem"
                        onClick={() => void handleSend()}
                        className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <HugeIcon name="arrow-up-01" size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Enviar mensagem</TooltipContent>
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
                Mencionar
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
                  <div className="text-xs text-muted-foreground">{command.description}</div>
                </div>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
