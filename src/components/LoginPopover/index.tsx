'use client';

import { useEffect, useState } from 'react';
import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';
import { Separator } from '@/components/ui/separator';
import { ACCESS_CODE_LENGTH, normalizeAccessCode } from '@/lib/auth/accessCode';
import { routeNames } from '@/app/route.names';
import { cn } from '@/lib/utils';
import DiscordOAuth from '@/components/DiscordOAuth';
import QrLoginCamera from '@/components/QrLoginCamera';

/**
 * `choose` é a escolha do método; os outros dois são o segundo passo, e qual
 * deles existe depende do dispositivo (ver o par de botões no JSX): ler o QR
 * pede câmera e só faz sentido no celular, digitar o código é o caminho de
 * quem está num navegador de computador.
 */
type Step = 'choose' | 'qr' | 'code';

/**
 * `blocked` é o 429 do rate limit por IP — erro de digitação e "tenta de novo
 * mais tarde" pedem textos diferentes. `success` é o único estado que toma o
 * painel inteiro: dali em diante não há mais formulário, só a saída.
 */
type CodeState = 'idle' | 'checking' | 'error' | 'blocked' | 'success';

/** Quanto o selo de "conta autenticada" fica na tela antes do redirect. */
const SUCCESS_HOLD_MS = 1800;

/**
 * Consome o pareamento pelo transporte digitado (o mesmo que o QR consome pelo
 * `id`, ver src/lib/auth/devicePairing.ts). A resposta traz o cookie de sessão;
 * quem faz o login "acontecer" na tela é o redirect do efeito de sucesso — a
 * sessão do NextAuth é lida no servidor, então não adianta só trocar estado
 * aqui.
 */
async function verifyAccessCode(code: string): Promise<void> {
  const res = await fetch('/api/auth/qr/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('INVALID_OR_EXPIRED');
}

/**
 * O convite de entrada de quem chega deslogado — modelado no LoginModal do
 * projeto tdc (mesma origem do opencall), sem o sistema de temas dele: a
 * coluna decorativa aqui é um gradiente estático em vez do AppBackdrop.
 *
 * Renderizado por (channels)/layout.tsx quando `!authUser`, sempre aberto e
 * sem fechar por fora (`disableClose`) — diferente do tdc, o opencall não tem
 * nenhum conteúdo público de verdade atrás dele (o palco vira skeleton), então
 * não há o que dispensar pra ver.
 */
export default function LoginPopover() {
  const [step, setStep] = useState<Step>('choose');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');

  /** A saída depois do login: segura o selo e só então navega, pra sessão do servidor já estar de pé quando a home carregar de novo. */
  useEffect(() => {
    if (codeState !== 'success') return;
    const goTimer = setTimeout(() => window.location.replace(routeNames.HOME), SUCCESS_HOLD_MS);
    return () => clearTimeout(goTimer);
  }, [codeState]);

  function goToChoose() {
    setStep('choose');
    setCode('');
    setCodeState('idle');
  }

  /**
   * Digitar o último caractere é o envio: um botão "confirmar" aqui só
   * existiria pra ser clicado sempre. A normalização é a mesma do servidor
   * (`normalizeAccessCode`) — quem lê `0` na tela e digita `O` acerta.
   */
  function handleCodeChange(raw: string) {
    const next = normalizeAccessCode(raw);
    setCode(next);
    if (codeState !== 'checking') setCodeState('idle');
    if (next.length < ACCESS_CODE_LENGTH) return;

    setCodeState('checking');
    verifyAccessCode(next)
      .then(() => setCodeState('success'))
      .catch((err: Error) => {
        setCode('');
        setCodeState(err.message === 'RATE_LIMITED' ? 'blocked' : 'error');
      });
  }

  const success = codeState === 'success';
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
            <p className="text-sm text-foreground/70">Bem-vindo ao OpenCall</p>
            <p className="text-2xl font-bold leading-tight text-foreground">Faça login para usar toda a experiência da plataforma.</p>
          </div>
        </div>

        <div className={cn('flex flex-col justify-center gap-6 p-6 md:p-8', veiled)}>
          {step === 'choose' && (
            <>
              <div className="space-y-2">
                <HugeIcon name="shield-01" size={36} className="text-primary md:hidden" />
                <DialogTitle className="text-2xl font-bold">Entrar no OpenCall</DialogTitle>
                <DialogDescription>A conta do Discord libera os canais de voz e o bate-papo.</DialogDescription>
              </div>

              <div className="flex flex-col gap-4">
                <DiscordOAuth />

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <Separator className="flex-1" />
                </div>

                {/* Mesma lógica do tdc: decidido pelo breakpoint, não por JS —
                    detectar mobile em efeito trocaria o botão depois do
                    primeiro paint. */}
                <Button type="button" variant="outline" className="w-full gap-2 py-6 md:hidden" onClick={() => setStep('qr')}>
                  <HugeIcon name="qr-code-scan" size={20} />
                  <span>Ler QR Code</span>
                </Button>
                <Button type="button" variant="outline" className="hidden w-full gap-2 py-6 md:flex" onClick={() => setStep('code')}>
                  <HugeIcon name="password-validation" size={20} />
                  <span>Inserir código de acesso</span>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground md:hidden">
                Já está logado no computador? Abre <b>Entrar em outro dispositivo</b> por lá e lê aqui — não precisa digitar nada.
              </p>
              <p className="hidden text-xs text-muted-foreground md:block">
                Já está logado em outro dispositivo? Abre <b>Entrar em outro dispositivo</b> por lá e digita aqui — não precisa de senha.
              </p>
            </>
          )}

          {step === 'qr' && (
            <>
              <StepHeader title="Ler o QR Code" onBack={goToChoose}>
                No dispositivo já logado, abre <b>Entrar em outro dispositivo</b> e aponta a câmera pro QR.
              </StepHeader>
              <QrLoginCamera active={step === 'qr'} />
            </>
          )}

          {step === 'code' && (
            <>
              <StepHeader title="Código de acesso" onBack={goToChoose}>
                No dispositivo já logado, abre <b>Entrar em outro dispositivo</b> e digita aqui os seis caracteres que aparecem lá.
              </StepHeader>

              <div className="flex flex-col gap-3">
                <InputOTP
                  autoFocus
                  value={code}
                  onChange={handleCodeChange}
                  maxLength={ACCESS_CODE_LENGTH}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                  pasteTransformer={normalizeAccessCode}
                  inputMode="text"
                  autoComplete="one-time-code"
                  disabled={codeState === 'checking'}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>

                {codeState === 'checking' && <div className="h-4 w-32 animate-pulse rounded-md bg-muted/60" />}
                {codeState === 'error' && (
                  <p className="text-xs text-destructive">
                    Código inválido ou expirado. Gera um novo no dispositivo já logado — cada código vale 2 minutos.
                  </p>
                )}
                {codeState === 'blocked' && (
                  <p className="text-xs text-destructive">Muitas tentativas seguidas. Espera alguns minutos ou entra pelo Discord.</p>
                )}
              </div>
            </>
          )}
        </div>

        {success && <AuthenticatedSeal />}
      </DialogContent>
    </Dialog>
  );
}

/** O fim do fluxo: cobre as duas colunas (o formulário já desfocou atrás, ver `veiled`) e segura a atenção enquanto o redirect sai. */
function AuthenticatedSeal() {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-background/70 px-8 text-center animate-in fade-in duration-500 motion-reduce:animate-none"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <HugeIcon name="tick-02" size={34} />
      </span>
      <div className="space-y-1.5">
        <p className="text-xl font-bold text-foreground">Conta autenticada</p>
        <p className="text-sm text-muted-foreground">Vamos te redirecionar para a melhor experiência…</p>
      </div>
    </div>
  );
}

/** O cabeçalho dos dois segundos passos: o mesmo par voltar + título nos dois, e o DialogTitle que o Radix exige em qualquer estado. */
function StepHeader({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Button type="button" variant="ghost" size="icon" onClick={onBack} className="-ml-2 shrink-0" aria-label="Voltar">
        <HugeIcon name="arrow-left-01" size={18} />
      </Button>
      <div className="space-y-1">
        <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
        <DialogDescription>{children}</DialogDescription>
      </div>
    </div>
  );
}
