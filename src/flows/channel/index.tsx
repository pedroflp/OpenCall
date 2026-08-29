import { Link } from 'next-view-transitions';
import { getUserAccountData } from '@/app/api/user/actions';
import { routeNames } from '@/app/route.names';
import { DEFAULT_CHANNEL_ID, getChannel } from '@/lib/rtc/channels';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import VoiceChannelContent from './VoiceChannelContent';

// Auth e canalAccess já foram checados no layout (ver src/app/(channels)/layout.tsx)
// — ele só renderiza `children` (e portanto esta página) quando os dois estão
// liberados, então não precisa repetir o gate aqui.
export default async function ChannelPage({ channelId }: { channelId?: string }) {
  const channel = getChannel(channelId ?? DEFAULT_CHANNEL_ID);
  if (!channel) return (
    <main className="flex flex-col gap-8 items-center h-full justify-center">
      <HugeIcon name="mic-off-02" size={92} />
      <h1 className="text-3xl font-bold">Canal não encontrado</h1>
      <Link href={routeNames.HOME}>
        <Button variant="outline">Voltar para o início</Button>
      </Link>
    </main>
  );

  const user = await getUserAccountData();

  return <VoiceChannelContent channelId={channel.id} channelName={channel.name} user={user} />;
}
