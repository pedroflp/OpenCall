import { NextRequest } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { subscribeToChatEvents, type ChatEvent } from '@/lib/chat/signal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cópia estrutural de /api/rtc/call/events — mantém a conexão viva atrás de
// qualquer proxy que corte streams ociosos (Railway incluso).
const PING_INTERVAL_MS = 25_000;

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (pingInterval) clearInterval(pingInterval);
    unsubscribe?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      unsubscribe = subscribeToChatEvents(user.id, send);

      pingInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, PING_INTERVAL_MS);
    },
    cancel() {
      cleanup();
    },
  });

  req.signal.addEventListener('abort', cleanup);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
