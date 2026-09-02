'use client';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>Leia o QR Code</DialogTitle>
          <DialogDescription><b>No dispositivo já logado</b> clique no botão <Button
            variant="outline"
            size="sm"
            className='gap-1 text-[10px] px-1.5 h-6 pointer-events-none'
          >
            <HugeIcon name="qr-code-01" size={16} />
            Entrar em outro dispositivo
          </Button> para gerar o código de acesso e fazer a leitura!</DialogDescription>

        </DialogHeader>

        <QrLoginCamera active={open} />
      </DialogContent>
    </Dialog>
  );
}
