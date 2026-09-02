import { WebhookReceiver } from 'livekit-server-sdk';
import { applyPresenceWebhook } from '@/lib/rtc/presence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForReceiver = globalThis as unknown as { __livekitWebhookReceiver?: WebhookReceiver };

function receiver(): WebhookReceiver {
  return (globalForReceiver.__livekitWebhookReceiver ??= new WebhookReceiver(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  ));
}

/**
 * Entrada de eventos do LiveKit (`participant_joined/left`, `room_started/finished`,
 * `track_published/unpublished`) — é o que transforma presença de polling em push:
 * o store passa a saber quem está em cada canal sem consultar o LiveKit, e quem
 * está olhando de fora recebe a mudança na hora pelo SSE de /api/rtc/presence/events.
 *
 * Precisa estar cadastrado no painel do LiveKit (Settings > Webhooks) apontando
 * pra <NEXTAUTH_URL>/api/rtc/webhook. Se não estiver, nada quebra: o store cai
 * sozinho no modo de leitura sob demanda (ver webhooksAlive em lib/rtc/presence).
 *
 * Sem sessão — quem chama é o servidor do LiveKit, não um usuário. A autenticidade
 * vem do header Authorization assinado com o API secret, validado pelo
 * WebhookReceiver; por isso a rota está fora do gate de canal no middleware.
 */
export async function POST(req: Request) {
  const body = await req.text();

  let event;
  try {
    event = await receiver().receive(body, req.headers.get('Authorization') ?? undefined);
  } catch (error) {
    console.error('[rtc/webhook] assinatura inválida', error);
    return new Response('invalid signature', { status: 401 });
  }

  await applyPresenceWebhook(event);

  // O LiveKit reenfileira e repete o evento em qualquer resposta que não seja
  // 2xx — o processamento acima não pode fazer a rota falhar.
  return new Response(null, { status: 204 });
}
