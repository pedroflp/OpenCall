'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/useIsMobile';

/** Não faz parte do lib.dom.d.ts padrão — só Chromium expõe esse evento. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `navigator.standalone` é a única forma de detectar isso no iOS Safari —
  // não existe display-mode: standalone lá fora do modo instalado de verdade.
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * iOS Safari não expõe `beforeinstallprompt` — a Apple nunca deu uma API pra
 * disparar "Adicionar à Tela de Início" via código, só o usuário pelo menu de
 * compartilhamento. Nesse caso o modal mostra um passo a passo em vez de um
 * botão de instalar. Chrome/Edge (Android e desktop) capturam o evento
 * nativo, mas só disparam `.prompt()` em resposta direta a um toque — não dá
 * pra chamar sozinho ao carregar a página, por isso o botão "Instalar"
 * dentro do modal existe mesmo no fluxo automático.
 *
 * Só é montado (ver ChannelsLayout) quando `user.isMobileDownloaded` ainda é
 * false — aparece de novo em qualquer janela/dispositivo mobile do usuário
 * até ele marcar "Não mostrar novamente", que persiste a flag no Postgres.
 */
export default function InstallAppButton() {
  const t = useTranslations('install');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const isMobile = useIsMobile();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIOS());

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  // Abre sozinho toda vez que a tela está numa proporção mobile e o app
  // ainda não foi instalado — sem trava de "uma vez por sessão", já que quem
  // decide se para de ver é o checkbox "Não mostrar novamente".
  useEffect(() => {
    if (installed || !isMobile) return;
    if (!ios && !deferredPrompt) return;
    setModalOpen(true);
  }, [installed, isMobile, ios, deferredPrompt]);

  if (installed) return null;
  if (!ios && !deferredPrompt) return null;

  async function persistDontShowAgain() {
    try {
      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMobileDownloaded: true }),
      });
      router.refresh();
    } catch {
      // silencioso — na pior hipótese o popup aparece de novo na próxima janela
    }
  }

  function handleClose() {
    setModalOpen(false);
    if (dontShowAgain) void persistDontShowAgain();
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    handleClose();
  }

  return (
    <>
      <Dialog open={modalOpen} onOpenChange={(open) => (open ? setModalOpen(true) : handleClose())}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image src="/icons/opencall-192.png" width={24} height={24} alt="" className="rounded-[6px]" />
              {t('title')}
            </DialogTitle>
            <DialogDescription>{ios ? t('descriptionIos') : t('description')}</DialogDescription>
          </DialogHeader>

          {ios ? (
            <ol className="flex flex-col gap-3">
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeIcon name="more-horizontal" size={18} />
                </span>
                <span className="pt-1 text-sm leading-snug text-foreground">
                  {t.rich('iosStep1', { b: (chunks) => <strong>{chunks}</strong> })}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeIcon name="share-08" size={18} />
                </span>
                <span className="pt-1 text-sm leading-snug text-foreground">
                  {t.rich('iosStep2', { b: (chunks) => <strong>{chunks}</strong> })}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeIcon name="screen-add-to-home" size={18} />
                </span>
                <span className="pt-1 text-sm leading-snug text-foreground">
                  {t.rich('iosStep3', { b: (chunks) => <strong>{chunks}</strong> })}
                </span>
              </li>
            </ol>
          ) : (
            <Button type="button" onClick={() => void handleInstallClick()} className="w-full">
              {t('action')}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">{ios ? t('afterInstallIos') : t('afterInstall')}</p>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 accent-primary"
            />
            {t('dontShowAgain')}
          </label>

          <Button type="button" variant="outline" onClick={handleClose} className="w-full">
            {tCommon('close')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
