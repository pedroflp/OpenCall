'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DevicePairingPanel from './DevicePairingPanel';

/**
 * Aberto pelo menu "OpenCall" (RtcHeader) de quem já está logado — gera o
 * pareamento que o LoginPopover/QrLoginScanner do outro dispositivo consomem
 * (ler QR ou digitar o código), ver src/lib/auth/devicePairing.ts.
 */
export default function DevicePairingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Entrar em outro dispositivo</DialogTitle>
          <DialogDescription>Escaneia com a câmera ou digita o código pra entrar sem digitar a senha do Discord de novo.</DialogDescription>
        </DialogHeader>

        <DevicePairingPanel active={open} />
      </DialogContent>
    </Dialog>
  );
}
