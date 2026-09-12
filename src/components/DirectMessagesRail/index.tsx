'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Link } from 'next-view-transitions';
import { AnimatePresence, motion } from 'motion/react';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hideDmConversation, useDirectConversations, type DirectConversationSummary } from '@/hooks/useDirectConversations';
import { routeNames } from '@/app/route.names';
import StartDirectMessageDialog from './StartDirectMessageDialog';

/**
 * Rail permanente de mensagens diretas — irmão de VoiceChannelSidebar e
 * PlatformUsersSidebar (ver src/app/(channels)/layout.tsx), não uma seção
 * dentro deles. Só avatar: um usuário por conversa recente, sem nome nem
 * preview na tela — quem quer saber quem é passa o mouse (tooltip com o nome
 * mascarado, já resolvido pelo servidor em channelsIdentity).
 *
 * Escondido abaixo de 900px, mesmo breakpoint de VoiceChannelSidebar e
 * PlatformUsersSidebar.
 */

const UNREAD_DISPLAY_CAP = 99;

/** Não é status dot: carrega número, então precisa de largura mínima em vez de um círculo fixo pra não espremer "99+". */
function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="absolute -bottom-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > UNREAD_DISPLAY_CAP ? `${UNREAD_DISPLAY_CAP}+` : count}
    </span>
  );
}

const rowBirth = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
};

/**
 * Clique direito no avatar, ou o botão que aparece no hover — mesmo par de
 * gatilhos do menu de contexto de canal, sem exigir permissão nenhuma: é a
 * própria pessoa removendo a própria conversa da própria barra lateral.
 *
 * "Remover" não é "excluir": só marca hiddenAt em DirectConversationRead —
 * nenhuma mensagem é apagada, e o outro participante nem sabe. Ela reaparece
 * sozinha se chegar mensagem nova.
 */
function ConversationAvatar({ conversation, active }: { conversation: DirectConversationSummary; active: boolean }) {
  const t = useTranslations('dm.rail');
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleHide() {
    setMenuOpen(false);
    hideDmConversation(conversation.id);

    // Escondida enquanto está aberta deixaria a pessoa numa conversa que
    // acabou de sumir da própria barra lateral — sai antes.
    if (active) router.replace(routeNames.HOME);
  }

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverAnchor asChild>
        <div
          className="group/dm relative flex items-center justify-center"
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div layout variants={rowBirth} initial="initial" animate="animate" exit="exit">
                <Link
                  href={routeNames.DM(conversation.id)}
                  aria-label={conversation.otherParticipant.username}
                  className="relative flex size-11 shrink-0 items-center justify-center rounded-full ring-primary data-[active=true]:ring-2"
                  data-active={active || undefined}
                >
                  <Avatar image={conversation.otherParticipant.avatar} fallback={conversation.otherParticipant.username.slice(0, 2)} size={9} />
                  {conversation.unreadCount > 0 && <UnreadBadge count={conversation.unreadCount} />}
                </Link>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="right">{conversation.otherParticipant.username}</TooltipContent>
          </Tooltip>

          <button
            type="button"
            aria-label={t('hideConversation')}
            onClick={handleHide}
            className="invisible absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground group-hover/dm:visible focus-visible:visible"
          >
            <HugeIcon name="archive" size={11} />
          </button>
        </div>
      </PopoverAnchor>

      <PopoverContent side="right" align="start" sideOffset={6} className="w-56 p-1">
        <button
          type="button"
          onClick={handleHide}
          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-secondary"
        >
          <HugeIcon name="archive" size={16} />
          {t('hideConversation')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function DirectMessagesRailSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="size-9 shrink-0 animate-pulse rounded-full bg-muted/60" />
      ))}
    </div>
  );
}

export default function DirectMessagesRail() {
  const t = useTranslations('dm.rail');
  const pathname = usePathname();
  const { conversations, loading } = useDirectConversations();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border/40 bg-muted p-2 min-[900px]:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('newConversation')}
            onClick={() => setPickerOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <HugeIcon name="add-01" size={20} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('newConversation')}</TooltipContent>
      </Tooltip>

      <StartDirectMessageDialog open={pickerOpen} onOpenChange={setPickerOpen} />

      <Separator className="w-8" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
        {loading ? (
          <DirectMessagesRailSkeleton />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {conversations.map((conversation) => (
              <ConversationAvatar key={conversation.id} conversation={conversation} active={pathname === routeNames.DM(conversation.id)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
