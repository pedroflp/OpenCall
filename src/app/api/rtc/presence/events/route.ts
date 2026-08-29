import { NextRequest } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';
import { presenceSnapshot, subscribeToPresence, type PresenceSnapshot } from '@/lib/rtc/presence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mesmo motivo de /api/rtc/call/events: proxy que corta stream ocioso não pode derrubar a conexão. */
const PING_INTERVAL_MS = 25_000;

/**
 * Presença de todos os canais numa conexão só, empurrada quando muda — substitui
 * o poll de 10s por canal que cada cliente mantinha. Uma conexão por aba, não
 * uma por canal: o cliente indexa o snapshot por canal (ver useChannelPresence).
 */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!(await isRtcEnabled())) return new Response('Service disabled', { status: 503 });

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
      const send = (snapshot: PresenceSnapshot) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Snapshot inicial imediato: sem isso a UI ficaria em branco até a
      // primeira mudança de presença, que pode nunca vir.
      send(presenceSnapshot());
      unsubscribe = subscribeToPresence(send);

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
