import { prisma } from '@/services/prisma';
import { routeNames } from '@/app/route.names';
import { sendDiscordChannelMessage, deleteDiscordMessage } from './bot';

/** Tempo de vida padrão do alerta, mesmo que ninguém saia do canal (ex: cliente cai sem avisar). */
const ALERT_TTL_MS = 3 * 60 * 1000;

// setTimeout em memória não sobrevive a restart do processo — por isso o
// estado real (se existe alerta ativo, e quando expira) mora no banco, e
// esse Map é só uma otimização pra apagar no timer certo sem esperar o
// próximo join/leave. Se o processo reiniciar no meio da janela, o alerta só
// será limpo quando o canal esvaziar de fato ou o próximo join olhar o
// expiresAt já vencido — o TTL vira "no máximo" em vez de "exatamente".
const globalForAlerts = globalThis as unknown as { __voiceChannelAlertTimers?: Map<string, NodeJS.Timeout> };
const pendingExpirations = (globalForAlerts.__voiceChannelAlertTimers ??= new Map());

function scheduleExpiration(channelId: string, delayMs: number) {
  const existing = pendingExpirations.get(channelId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(() => {
    pendingExpirations.delete(channelId);
    clearAlert(channelId).catch((error) => console.error('[voiceChannelAlert] failed to expire alert', error));
  }, delayMs);
  pendingExpirations.set(channelId, timeout);
}

function cancelScheduledExpiration(channelId: string) {
  const existing = pendingExpirations.get(channelId);
  if (!existing) return;
  clearTimeout(existing);
  pendingExpirations.delete(channelId);
}

async function deleteAlertMessage(discordMessageId: string) {
  const discordChannelId = process.env.DISCORD_CHAT_CHANNEL_ID;
  if (!discordChannelId) return;
  await deleteDiscordMessage(discordChannelId, discordMessageId).catch((error) =>
    console.error('[voiceChannelAlert] failed to delete Discord message', error),
  );
}

/** Apaga a mensagem (se existir) e a linha de controle — chamada tanto pelo TTL quanto pelo canal esvaziando. */
async function clearAlert(channelId: string): Promise<void> {
  cancelScheduledExpiration(channelId);

  const alert = await prisma.voiceChannelAlert.findUnique({ where: { channelId } });
  if (!alert) return;

  await deleteAlertMessage(alert.discordMessageId);
  await prisma.voiceChannelAlert.delete({ where: { channelId } }).catch(() => {
    // Outra saída simultânea já apagou a linha — o objetivo (nenhum alerta
    // ativo pro canal) está cumprido de qualquer forma.
  });
}

/**
 * Chamada em /api/rtc/join: se já existe alerta ativo pro canal, não manda
 * outro (o pedido explícito de "não enviar outra para novos ingressantes").
 * Se o doc existente já passou do TTL (processo reiniciou e ninguém saiu do
 * canal nesse meio tempo), trata como se não existisse e limpa antes.
 */
export async function notifyChannelJoin(
  channel: { id: string; name: string },
  user: { username: string; avatar?: string },
): Promise<void> {
  const discordChannelId = process.env.DISCORD_CHAT_CHANNEL_ID;
  if (!discordChannelId) return;

  const existing = await prisma.voiceChannelAlert.findUnique({ where: { channelId: channel.id } });

  if (existing) {
    if (existing.expiresAt.getTime() > Date.now()) return;
    await clearAlert(channel.id);
  }

  const channelLink = new URL(routeNames.CHANNEL(channel.id), process.env.NEXTAUTH_URL).toString();

  const message = await sendDiscordChannelMessage(discordChannelId, {
    embeds: [
      {
        color: 0x57f287,
        author: { name: `${user.username} entrou no canal`, icon_url: user.avatar || undefined },
        title: channel.name,
        description: 'Bora participar? 🎙️',
        url: channelLink,
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Entrar no canal', url: channelLink }] }],
  });

  const expiresAt = new Date(Date.now() + ALERT_TTL_MS);
  await prisma.voiceChannelAlert.upsert({
    where: { channelId: channel.id },
    create: { channelId: channel.id, discordMessageId: message.id, expiresAt },
    update: { discordMessageId: message.id, expiresAt },
  });
  scheduleExpiration(channel.id, ALERT_TTL_MS);
}

/** Chamada em /api/rtc/leave quando o canal ficou vazio — apaga o alerta na hora em vez de esperar o TTL. */
export async function notifyChannelEmpty(channelId: string): Promise<void> {
  await clearAlert(channelId);
}
