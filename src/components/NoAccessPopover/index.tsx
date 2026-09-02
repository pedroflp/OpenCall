'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { normalizeInviteCode } from '@/lib/invite/inviteCode';
import { cn } from '@/lib/utils';

type State = 'idle' | 'checking' | 'error' | 'blocked' | 'success';

/** Quanto o selo de "acesso liberado" fica na tela antes do refresh. */
const SUCCESS_HOLD_MS = 1400;

async function redeemInviteCode(code: string): Promise<void> {
  const res = await fetch('/api/invite/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('INVALID_CODE');
}

/** `?convite=` na URL — quem chega autenticado por esse link (ou acabou de logar vindo de um) resgata sozinho, sem colar nada. */
const INVITE_QUERY_PARAM = 'convite';

/**
 * Mesmo shell visual do LoginPopover (2 colunas, coluna decorativa à
 * esquerda), pra quem já autenticou com Discord mas ainda não tem
 * canalAccess — coluna direita vira um campo pra colar o código de convite em
 * vez dos métodos de login. Renderizado por (channels)/layout.tsx no lugar do
 * antigo aviso estático quando authUser existe e canalAccess não.
 */
export default function NoAccessPopover() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [state, setState] = useState<State>('idle');
  const autoTriedRef = useRef(false);

  function redeem(rawCode: string) {
    const normalized = normalizeInviteCode(rawCode);
    if (!normalized || state === 'checking') return;

    setState('checking');
    redeemInviteCode(normalized)
      .then(() => setState('success'))
      .catch((err: Error) => setState(err.message === 'RATE_LIMITED' ? 'blocked' : 'error'));
  }

  // Chega autenticado (ou acabou de autenticar vindo) com `?convite=` na URL —
  // o Discord OAuth preserva a URL inteira como callback (ver LoginPopover),
  // então esse param sobrevive ao login. Resgata sozinho, sem pedir pra colar.
  useEffect(() => {
    if (autoTriedRef.current) return;
    const fromUrl = searchParams.get(INVITE_QUERY_PARAM);
    if (!fromUrl) return;

    autoTriedRef.current = true;
    setCode(fromUrl);
    redeem(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => router.refresh(), SUCCESS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [state, router]);

  function handleSubmit() {
    redeem(code);
  }

  const success = state === 'success';
  const veiled = cn('transition duration-500 motion-reduce:transition-none', success && 'blur-sm opacity-30');

  return (
    <Dialog open>
      <DialogContent
        disableClose
        className="grid w-[calc(100%-2rem)] max-w-3xl grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-2"
      >
        <div
          className={cn(
            'relative hidden min-h-[26rem] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-background p-8 md:flex',
            veiled
          )}
        >
          <HugeIcon name="shield-01" size={44} className="relative text-primary" />
          <div className="relative space-y-2">
            <p className="text-sm text-foreground/70">Quase lá</p>
            <p className="text-2xl font-bold leading-tight text-foreground">Um código de convite libera os canais pra você.</p>
          </div>
        </div>

        <div className={cn('flex flex-col justify-center gap-6 p-6 md:p-8', veiled)}>
          <div className="space-y-2">
            <HugeIcon name="lock-01" size={36} className="text-primary md:hidden" />
            <DialogTitle className="text-2xl font-bold">Código de convite</DialogTitle>
            <DialogDescription>
              Sua conta ainda não tem acesso aos canais. Cola aqui o código que um admin te passou, ou peça pra ele liberar em
              /admin/channels.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Código de convite"
              autoFocus
              disabled={state === 'checking'}
              className="font-mono uppercase tracking-widest"
            />

            {state === 'error' && <p className="text-xs text-destructive">Código inválido, expirado ou revogado.</p>}
            {state === 'blocked' && (
              <p className="text-xs text-destructive">Muitas tentativas seguidas. Espera alguns minutos e tenta de novo.</p>
            )}

            <Button type="button" className="w-full" disabled={!code.trim() || state === 'checking'} onClick={handleSubmit}>
              {state === 'checking' ? 'Verificando…' : 'Resgatar acesso'}
            </Button>
          </div>
        </div>

        {success && <AuthorizedSeal />}
      </DialogContent>
    </Dialog>
  );
}

function AuthorizedSeal() {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-background/70 px-8 text-center animate-in fade-in duration-500 motion-reduce:animate-none"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <HugeIcon name="tick-02" size={34} />
      </span>
      <div className="space-y-1.5">
        <p className="text-xl font-bold text-foreground">Acesso liberado</p>
        <p className="text-sm text-muted-foreground">Carregando os canais…</p>
      </div>
    </div>
  );
}
