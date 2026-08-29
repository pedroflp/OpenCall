export const routeNames = {
  // A experiência de canais fundiu com a home — não existe mais landing
  // separada, então HOME e CHANNELS sempre apontam pro mesmo lugar.
  HOME: '/',
  CHANNELS: '/',
  CHANNEL: (channelId: string) => `/${channelId}`,
  CHANNEL_TEXT: '/text',
  ADMIN: '/admin',
  ADMIN_CHANNELS: '/admin/channels',
  // Página pública (sem canalAccess) — só existe pra dar uma prévia rica
  // (imagem, título) quando o link é colado no Discord; quem clica cai no
  // fluxo normal de /, com login exigido lá.
  INVITE: '/convite',
}
