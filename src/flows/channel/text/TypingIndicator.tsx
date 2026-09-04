'use client';

import { useTranslations } from 'next-intl';

interface TypingUser {
  id: string;
  username: string;
}

/** Some sozinho: o caller para de passar o usuário 6s depois do último evento (ver useTypingUsers em TextChannelView). */
export default function TypingIndicator({ users }: { users: TypingUser[] }) {
  const t = useTranslations('chat');

  if (users.length === 0) return null;

  return (
    <div className="flex h-5 items-center gap-1.5 px-4 text-xs font-medium text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {/* Um `plural` do ICU no lugar do if/if/return: além do "1 pessoa vs N
          pessoas", é ele que deixa a tradução escolher a forma verbal certa
          ("está" vs "estão") sem que este componente saiba disso. `others` vai
          separado do `count` porque a frase de 3+ fala dos OUTROS, não do
          total. */}
      {t('typing', {
        count: users.length,
        first: users[0].username,
        second: users[1]?.username ?? '',
        others: users.length - 1,
      })}
    </div>
  );
}
