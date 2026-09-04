'use client';

import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '../ui/button';
import QrLoginCamera from '@/components/QrLoginCamera';

/**
 * Hospeda QrLoginCamera num Dialog próprio — reaberto pelo rodapé da sidebar
 * (QrLoginButton) pra quem dispensou o LoginPopover, que usa a mesma câmera
 * inline no passo "Ler QR Code" em vez de empilhar este Dialog por cima.
 */
export default function QrLoginScanner({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('auth.scanner');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {/* O botão de mentira (`pointer-events-none`) é um RETRATO do botão
              real que está na outra tela, então o rótulo dele vem de dentro da
              mensagem: em inglês a frase o coloca em outro ponto, e a tradução
              precisa poder mover as duas coisas juntas. */}
          <DialogDescription>
            {t.rich('description', {
              b: (chunks) => <b>{chunks}</b>,
              deviceButton: (chunks) => (
                <Button variant="outline" size="sm" className="gap-1 text-[10px] px-1.5 h-6 pointer-events-none">
                  <HugeIcon name="qr-code-01" size={16} />
                  {chunks}
                </Button>
              ),
            })}
          </DialogDescription>
        </DialogHeader>

        <QrLoginCamera active={open} />
      </DialogContent>
    </Dialog>
  );
}
