import { NextRequest } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { appCommit } from '@/lib/appCommit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mesmo motivo dos outros streams: proxy que corta conexão ociosa não pode derrubar isto. */
const PING_INTERVAL_MS = 25_000;

/**
 * O commit não muda enquanto o processo vive — este stream não existe pra
 * empurrar valor novo, e sim pra MORRER junto com o processo. Um deploy que
 * derruba o container fecha a conexão, o cliente cai no `onerror` e confere na
 * hora, em segundos, em vez de esperar o próximo poll de 45s.
 *
 * O primeiro frame carrega o commit porque é ele que vira a baseline da aba
 * (ver applyCommit em useAppVersion); os pings depois disso só seguram a linha.
 */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (pingInterval) clearInterval(pingInterval);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ commit: appCommit() })}\n\n`));
      } catch {
        cleanup();
        return;
      }

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
