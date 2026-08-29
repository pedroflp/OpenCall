/**
 * Cliente REST mínimo do bot do Discord — sem discord.js/gateway (removidos em
 * c6efb7a junto do bot de voz). DM não precisa de conexão persistente: só
 * `POST /users/@me/channels` pra abrir/reaproveitar o canal, depois
 * `POST /channels/{id}/messages` pra mandar a mensagem.
 *
 * Limitação da própria API do Discord (não específica daqui): o bot só
 * consegue abrir DM com quem compartilha um servidor com ele, e o
 * destinatário pode ter DMs de membros do servidor desativado — nesses
 * casos a API responde 403.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class DiscordApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function discordRequest(path: string, init: RequestInit): Promise<Response> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

  return fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  image?: { url: string };
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

// Botão de link (style 5): abre a URL direto no client de quem recebe, sem
// passar pelo endpoint de interactions — não precisa de gateway nem de handler
// de interação nenhum pro bot, só de mandar esse shape junto da mensagem.
export interface DiscordLinkButton {
  type: 2;
  style: 5;
  label: string;
  url: string;
}

export interface DiscordActionRow {
  type: 1;
  components: DiscordLinkButton[];
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
}

export async function sendDiscordDirectMessage(discordUserId: string, payload: DiscordMessagePayload): Promise<void> {
  const channelResponse = await discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!channelResponse.ok) {
    throw new DiscordApiError('Failed to open DM channel', channelResponse.status);
  }
  const channel = (await channelResponse.json()) as { id: string };

  const messageResponse = await discordRequest(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!messageResponse.ok) {
    throw new DiscordApiError('Failed to send DM', messageResponse.status);
  }
}

export interface DiscordMessage {
  id: string;
}

// Post direto num canal de texto do servidor (o bot precisa já estar nele com
// permissão de "Send Messages") — sem o passo de abrir/reaproveitar DM channel,
// já que o destino já é um channel id fixo. Devolve a mensagem criada (id) pra
// quem precisa apagá-la depois (ver src/lib/discord/voiceChannelAlert.ts).
export async function sendDiscordChannelMessage(channelId: string, payload: DiscordMessagePayload): Promise<DiscordMessage> {
  const response = await discordRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new DiscordApiError('Failed to send channel message', response.status);
  }
  return (await response.json()) as DiscordMessage;
}

export async function deleteDiscordMessage(channelId: string, messageId: string): Promise<void> {
  const response = await discordRequest(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
  // 404 é "já não existe" (apagada manualmente, por exemplo) — mesmo estado que queríamos alcançar, não um erro.
  if (!response.ok && response.status !== 404) {
    throw new DiscordApiError('Failed to delete channel message', response.status);
  }
}
