'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { UserDTO } from '@/app/api/user/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { HugeIcon } from '@/components/HugeIcon';
import { useToast } from '@/components/ui/use-toast';
import { useCallAction } from '@/hooks/useCallAction';
import { getCallCooldownRemaining, setCallCooldown } from '@/lib/rtc/callCooldown';
import { routeNames } from '@/app/route.names';

// Chave fixa (não há "alvo" variável aqui, é sempre o mesmo canal do
// servidor) — reaproveita o mesmo Map de callCooldown.ts pra sobreviver ao
// fechar/abrir do modal, igual ao cooldown do "Chamar no Discord".
const SERVER_CHANNEL_COOLDOWN_KEY = 'server-chat-channel';
const SERVER_CHANNEL_COOLDOWN_MS = 60_000;

function SendToServerChannelSection() {
  const { toast } = useToast();
  const [status, setStatus] = useState<'idle' | 'sending' | 'cooldown'>(() =>
    getCallCooldownRemaining(SERVER_CHANNEL_COOLDOWN_KEY) > 0 ? 'cooldown' : 'idle'
  );
  const [remainingMs, setRemainingMs] = useState(() => getCallCooldownRemaining(SERVER_CHANNEL_COOLDOWN_KEY));

  useEffect(() => {
    if (status !== 'cooldown' || remainingMs <= 0) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          setStatus('idle');
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, remainingMs]);

  async function send() {
    if (status !== 'idle') return;
    setStatus('sending');

    try {
      const response = await fetch('/api/rtc/invite/channel', { method: 'POST' });

      if (response.ok) {
        setStatus('cooldown');
        setRemainingMs(SERVER_CHANNEL_COOLDOWN_MS);
        setCallCooldown(SERVER_CHANNEL_COOLDOWN_KEY, SERVER_CHANNEL_COOLDOWN_MS);
        return;
      }

      const data = (await response.json().catch(() => null)) as { error?: string; retryAfterMs?: number } | null;
      if (data?.error === 'COOLDOWN') {
        const retryAfterMs = data.retryAfterMs ?? SERVER_CHANNEL_COOLDOWN_MS;
        setStatus('cooldown');
        setRemainingMs(retryAfterMs);
        setCallCooldown(SERVER_CHANNEL_COOLDOWN_KEY, retryAfterMs);
        return;
      }

      setStatus('idle');
      toast({ title: 'Não deu pra enviar', description: 'Tenta de novo daqui a pouco.', variant: 'destructive' });
    } catch {
      setStatus('idle');
      toast({ title: 'Não deu pra enviar', description: 'Falha de rede, tenta de novo.', variant: 'destructive' });
    }
  }

  const label =
    status === 'sending' ? 'Enviando…' : status === 'cooldown' ? `Enviado — aguarde ${Math.ceil(remainingMs / 1000)}s` : 'Enviar no bate-papo';

  return (
    <Button type="button" variant="outline" className="gap-1" loading={status === 'sending'} disabled={status !== 'idle'} onClick={() => void send()}>
      <Image src="/assets/icons/discord.svg" width={16} height={16} alt="" className="size-4" />
      {label}
    </Button>
  );
}

// Rota pública própria (src/app/convite/page.tsx) em vez de linkar /channels
// direto — assim, ao colar no Discord, o link gera uma prévia com o mesmo
// banner do embed da DM (o /channels em si é gated e não teria isso).
function inviteUrl(user: UserDTO | null): string {
  if (typeof window === 'undefined') return routeNames.INVITE;

  const url = new URL(routeNames.INVITE, window.location.origin);
  if (user?.username) url.searchParams.set('name', user.username);
  if (user?.avatar) url.searchParams.set('avatar', user.avatar);
  return url.toString();
}

/** Mesma rota e mesmo hook do "Chamar no Discord" do PlatformUsersSidebar — só muda de onde vem o ID (digitado aqui, não da lista de presença). */
function SendToDiscordSection() {
  const [discordUserId, setDiscordUserId] = useState('');
  const { status, remainingMs, call } = useCallAction(discordUserId.trim());

  const label =
    status === 'sending' ? 'Enviando…' : status === 'cooldown' ? `Enviado — aguarde ${Math.ceil(remainingMs / 1000)}s` : 'Enviar';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Image src="/assets/icons/discord.svg" width={16} height={16} alt="" className="size-4" />
        Enviar no Discord
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="ID do usuário no Discord"
          value={discordUserId}
          onChange={(e) => setDiscordUserId(e.target.value)}
          disabled={status === 'sending'}
        />
        <Button
          type="button"
          variant="secondary"
          loading={status === 'sending'}
          disabled={status !== 'idle' || discordUserId.trim().length === 0}
          onClick={() => void call()}
        >
          {label}
        </Button>
      </div>
      <p className="text-[10px] underline-offset-2 text-muted-foreground">
        <b>Como pegar o ID</b>: Clique com o botão direito no usuário, &quot;Copiar ID do usuário&quot;(se não aparecer, ative o modo desenvolvedor nas configurações).
      </p>
    </div>
  );
}

export default function InviteToChannelsModal({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDTO | null;
}) {
  const { toast } = useToast();

  async function copy(text: string, successTitle: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: successTitle });
    } catch {
      toast({ title: 'Não deu pra copiar', description: 'Copie manualmente.', variant: 'destructive' });
    }
  }

  const url = inviteUrl(user);
  // Markdown que o próprio client do Discord já entende numa mensagem comum
  // (cabeçalho grande "# " funciona fora de embed) — a prévia com imagem vem
  // do unfurl automático da URL, que já é o link personalizado de /convite.
  const message = `# ${user?.username ?? 'Alguém'} está te chamando pra call\nEntra na chamada dos canais do OpenCall 👇\n${url}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar para os canais</DialogTitle>
          <DialogDescription>Compartilhe o link com quem você quiser, ou chame alguém direto no Discord.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="gap-1" onClick={() => void copy(url, 'Link copiado!')}>
              <HugeIcon name="copy-link" size={16} />
              Copiar link
            </Button>
            {/* <Button type="button" variant="outline" className="gap-1" onClick={() => void copy(message, 'Mensagem copiada!')}>
              <HugeIcon name="copy-01" size={16} />
              Copiar mensagem
            </Button> */}
            <SendToServerChannelSection />
          </div>

          <SendToDiscordSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
