'use client';

interface TypingUser {
  id: string;
  username: string;
}

function formatTypingLabel(users: TypingUser[]): string {
  if (users.length === 1) return `${users[0].username} está digitando…`;
  if (users.length === 2) return `${users[0].username} e ${users[1].username} estão digitando…`;
  return `${users[0].username} e mais ${users.length - 1} pessoas estão digitando…`;
}

/** Some sozinho: o caller para de passar o usuário 6s depois do último evento (ver useTypingUsers em TextChannelView). */
export default function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;

  return (
    <div className="flex h-5 items-center gap-1.5 px-4 text-xs font-medium text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {formatTypingLabel(users)}
    </div>
  );
}
