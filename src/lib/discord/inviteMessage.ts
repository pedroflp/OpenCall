import { routeNames } from '@/app/route.names';
import type { DiscordMessagePayload } from './bot';

/** Mesmo embed usado tanto na DM ("chamar"/"enviar no Discord") quanto no post no canal de bate-papo do servidor — mantém as duas superfícies visualmente idênticas. */
export function buildInviteMessage(user: { username: string; avatar?: string }): DiscordMessagePayload {
  const channelsUrl = new URL(routeNames.CHANNELS, process.env.NEXTAUTH_URL).toString();

  const bannerUrl = new URL('/api/og/invite', process.env.NEXTAUTH_URL);
  bannerUrl.searchParams.set('name', user.username);
  if (user.avatar) bannerUrl.searchParams.set('avatar', user.avatar);

  return {
    // <url> suprime o auto-unfurl do próprio Discord pra esse link — sem isso,
    // ele cria uma segunda prévia (feia, sem banner) empilhada abaixo do embed
    // rico que a gente já manda de propósito logo abaixo.
    content: `<${channelsUrl}>`,
    embeds: [
      {
        color: 0xf5a524,
        author: { name: `${user.username} está te chamando`, icon_url: user.avatar || undefined },
        title: 'Entrar na chamada',
        description: 'Estamos esperando você na sala do OpenCall',
        url: channelsUrl,
        image: { url: bannerUrl.toString() },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Entrar na chamada', url: channelsUrl }] }],
  };
}
