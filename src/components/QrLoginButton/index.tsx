'use client';

import { useState } from 'react';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import QrLoginScanner from '@/components/QrLoginScanner';

export default function QrLoginButton({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);

  if (collapsed) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => setOpen(true)} size="icon" variant="outline" aria-label="Entrar com QR Code">
              <HugeIcon name="qr-code-scan" size={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Entrar com QR Code</TooltipContent>
        </Tooltip>
        <QrLoginScanner open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" className="w-full gap-2 py-6">
        <HugeIcon name="qr-code-scan" size={20} />
        <span>Entrar com QR Code</span>
      </Button>
      <QrLoginScanner open={open} onOpenChange={setOpen} />
    </>
  );
}
