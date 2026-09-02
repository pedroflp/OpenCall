export const routeNames = {
  // A experiência de canais fundiu com a home — não existe mais landing
  // separada, então HOME e CHANNELS sempre apontam pro mesmo lugar.
  HOME: '/',
  CHANNELS: '/',
  CHANNEL: (channelId: string) => `/${channelId}`,
  // '/text' é alias do canal de texto padrão (primeiro por sortIndex, ver
  // getDefaultTextChannelId) — '/text/<channelId>' abre um canal específico.
  CHANNEL_TEXT: '/text',
  CHANNEL_TEXT_ID: (channelId: string) => `/text/${channelId}`,
  ADMIN: '/admin',
  ADMIN_CHANNELS: '/admin/channels',
  // Página pública (sem canalAccess) — só existe pra dar uma prévia rica
  // (imagem, título) quando o link é colado no Discord; quem clica cai no
  // fluxo normal de /, com login exigido lá.
  INVITE: '/convite',
}
