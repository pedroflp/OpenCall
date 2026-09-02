import { Link } from 'next-view-transitions';
import { ChannelType } from '@prisma/client';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getTextChannel, getDefaultTextChannelId } from '@/lib/chat/textChannels';
import { routeNames } from '@/app/route.names';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import NoChannelsEmptyState from '../NoChannelsEmptyState';
import TextChannelView from './TextChannelView';

// Auth e canalAccess já foram checados no layout (ver src/app/(channels)/layout.tsx)
// — ele só renderiza `children` (e portanto esta página) quando os dois estão
// liberados, então `authUser` aqui nunca é null.
export default async function TextChannelPage({ channelId }: { channelId?: string }) {
  const authUser = (await getUser())!;

  const resolvedChannelId = channelId ?? (await getDefaultTextChannelId());
  // Sem nenhum canal de texto cadastrado ainda (não confundir com id inválido
  // abaixo) — empty state que convida a criar o primeiro, não um "não achei".
  if (!resolvedChannelId) return <NoChannelsEmptyState type={ChannelType.TEXT} />;

  const channel = await getTextChannel(resolvedChannelId);

  if (!channel) return (
    <main className="flex flex-col gap-8 items-center h-full justify-center">
      <HugeIcon name="hashtag" size={92} />
      <h1 className="text-3xl font-bold">Canal não encontrado</h1>
      <Link href={routeNames.HOME}>
        <Button variant="outline">Voltar para o início</Button>
      </Link>
    </main>
  );

  return (
    <TextChannelView
      channelId={channel.id}
      channelName={channel.name}
      user={authUser}
      // Lido no servidor: a chave do GIPHY é secreta e nunca chega no browser
      // (ver lib/chat/giphy.ts). Sem ela o botão de GIF some — quem
      // self-hospeda não precisa de conta na Giphy pra ter chat.
      gifPickerEnabled={Boolean(process.env.GIPHY_API_KEY)}
    />
  );
}
