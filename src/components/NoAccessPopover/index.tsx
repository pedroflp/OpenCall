'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { normalizeInviteCode } from '@/lib/invite/inviteCode';
import { cn } from '@/lib/utils';

type State = 'idle' | 'checking' | 'error' | 'blocked' | 'success';

/** Quanto o selo de "acesso liberado" fica na tela antes do refresh. */
const SUCCESS_HOLD_MS = 1400;

/**
 * Se tanto tempo depois do refresh este popover ainda estiver montado, o
 * refresh não resolveu — o servidor continua dizendo que não há acesso.
 * Recarregar do zero é o último recurso, e é o que impede o estado que motivou
 * tudo isto: "Acesso liberado / Carregando os canais…" parado para sempre. Sem
 * risco de loop: a página volta em `idle`, não em `success`.
 */
const RELOAD_FALLBACK_MS = 3_000;

async function redeemInviteCode(code: string): Promise<void> {
  const res = await fetch('/api/invite/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('INVALID_CODE');
}

/** `?invite=` na URL — quem chega autenticado por esse link (ou acabou de logar vindo de um) resgata sozinho, sem colar nada. */
const INVITE_QUERY_PARAM = 'invite';

/**
 * Mesmo shell visual do LoginPopover (2 colunas, coluna decorativa à
 * esquerda), pra quem já autenticou com Discord mas ainda não tem
 * canalAccess — coluna direita vira um campo pra colar o código de convite em
 * vez dos métodos de login. Renderizado por (channels)/layout.tsx no lugar do
 * antigo aviso estático quando authUser existe e canalAccess não.
 */
export default function NoAccessPopover() {
  const t = useTranslations('auth.noAccess');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [code, setCode] = useState('');
  const [state, setState] = useState<State>('idle');
  const autoTriedRef = useRef(false);
  // A identidade de `update` muda junto com a sessão; numa dependência de
  // effect ela reiniciaria o timer do selo no meio do caminho.
  const updateSessionRef = useRef(updateSession);
  updateSessionRef.current = updateSession;

  function redeem(rawCode: string) {
    const normalized = normalizeInviteCode(rawCode);
    if (!normalized || state === 'checking') return;

    setState('checking');
    redeemInviteCode(normalized)
      .then(() => setState('success'))
      .catch((err: Error) => setState(err.message === 'RATE_LIMITED' ? 'blocked' : 'error'));
  }

  // Chega autenticado (ou acabou de autenticar vindo) com `?invite=` na URL —
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

  /**
   * `router.refresh()` sozinho não bastava. `canalAccess` vive no JWT da
   * sessão, e o resgate acontece numa rota de API — que não tem como reescrever
   * o cookie do navegador. Sem reemitir o token:
   *
   * - o middleware (que lê o cookie CRU, sem passar pelo callback jwt) continua
   *   respondendo 403 em /api/rtc, /api/chat e /api/channels: os canais até
   *   apareceriam, mas vazios;
   * - e, até a correção do `globalThis` em lib/access.ts, nem apareciam — o
   *   sinal de invalidação ficava na camada de módulo errada e o layout seguia
   *   lendo `canalAccess: false` até o TTL de 15min do token.
   *
   * `updateSession()` bate em /api/auth/session, que roda o callback jwt COM
   * `trigger: 'update'` (força a releitura das roles) e devolve o Set-Cookie.
   * Só depois disso o refresh tem o que ver.
   */
  useEffect(() => {
    if (state !== 'success') return;

    const hold = setTimeout(() => {
      void updateSessionRef
        .current()
        .then(() => router.refresh())
        .catch(() => {});
    }, SUCCESS_HOLD_MS);

    // No caminho feliz este componente desmonta assim que o layout enxerga o
    // acesso, e o cleanup mata os dois timers antes do reload.
    const fallback = setTimeout(() => window.location.reload(), SUCCESS_HOLD_MS + RELOAD_FALLBACK_MS);

    return () => {
      clearTimeout(hold);
      clearTimeout(fallback);
    };
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
            <p className="text-sm text-foreground/70">{t('almostThere')}</p>
            <p className="text-2xl font-bold leading-tight text-foreground">{t('almostThereSubtitle')}</p>
          </div>
        </div>

        <div className={cn('flex flex-col justify-center gap-6 p-6 md:p-8', veiled)}>
          <div className="space-y-2">
            <HugeIcon name="lock-01" size={36} className="text-primary md:hidden" />
            <DialogTitle className="text-2xl font-bold">{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={t('placeholder')}
              autoFocus
              disabled={state === 'checking'}
              className="font-mono uppercase tracking-widest"
            />

            {state === 'error' && <p className="text-xs text-destructive">{t('invalid')}</p>}
            {state === 'blocked' && <p className="text-xs text-destructive">{t('blocked')}</p>}

            <Button type="button" className="w-full" disabled={!code.trim() || state === 'checking'} onClick={handleSubmit}>
              {state === 'checking' ? t('checking') : t('redeem')}
            </Button>
          </div>
        </div>

        {success && <AuthorizedSeal />}
      </DialogContent>
    </Dialog>
  );
}

function AuthorizedSeal() {
  const t = useTranslations('auth.noAccess');

  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-background/70 px-8 text-center animate-in fade-in duration-500 motion-reduce:animate-none"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <HugeIcon name="tick-02" size={34} />
      </span>
      <div className="space-y-1.5">
        <p className="text-xl font-bold text-foreground">{t('granted')}</p>
        <p className="text-sm text-muted-foreground">{t('grantedDescription')}</p>
      </div>
    </div>
  );
}
