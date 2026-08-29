'use client';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { HugeIcon } from '@/components/HugeIcon';

interface IncomingCall {
  callId: string;
  from: { id: string; username: string; avatar: string };
  channelId: string;
  channelName: string;
}

export default function CallModal({ call, onRespond }: { call: IncomingCall; onRespond: (accept: boolean) => void }) {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent disableClose className="max-w-sm">
        <DialogTitle className="sr-only">Ligação recebida de {call.from.username}</DialogTitle>

        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <Avatar image={call.from.avatar} fallback={call.from.username.slice(0, 2)} size={20} />

          <div>
            <p className="text-lg font-semibold">{call.from.username}</p>
            <p className="text-sm text-muted-foreground">Te chamando pra entrar em {call.channelName}</p>
          </div>

          <div className="mt-2 flex items-center gap-6">
            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              aria-label="Recusar"
              onClick={() => onRespond(false)}
            >
              <HugeIcon name="call-end-01" size={24} />
            </Button>

            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-green-600 text-white hover:bg-green-600/90"
              aria-label="Aceitar"
              onClick={() => onRespond(true)}
            >
              <HugeIcon name="call-done-02" size={24} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
