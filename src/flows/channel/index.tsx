import { Link } from 'next-view-transitions';
import { getTranslations } from 'next-intl/server';
import { ChannelType } from '@prisma/client';
import { getUserAccountData } from '@/app/api/user/actions';
import { routeNames } from '@/app/route.names';
import { getChannel, getDefaultChannelId } from '@/lib/rtc/channels';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import NoChannelsEmptyState from './NoChannelsEmptyState';
import VoiceChannelContent from './VoiceChannelContent';

// Auth e canalAccess já foram checados no layout (ver src/app/(channels)/layout.tsx)
// — ele só renderiza `children` (e portanto esta página) quando os dois estão
// liberados, então não precisa repetir o gate aqui.
export default async function ChannelPage({ channelId }: { channelId?: string }) {
  const resolvedChannelId = channelId ?? (await getDefaultChannelId());
  // Sem nenhum canal de voz cadastrado ainda (não confundir com id inválido
  // abaixo) — empty state que convida a criar o primeiro, não um "não achei".
  if (!resolvedChannelId) return <NoChannelsEmptyState type={ChannelType.VOICE} />;

  const channel = await getChannel(resolvedChannelId);
  if (!channel) {
    // `getTranslations` (e não `useTranslations`) porque isto é Server
    // Component: o catálogo vem da mesma request que resolveu o cookie.
    const t = await getTranslations('channels');

    return (
      <main className="flex flex-col gap-8 items-center h-full justify-center">
        <HugeIcon name="mic-off-02" size={92} />
        <h1 className="text-3xl font-bold">{t('notFound')}</h1>
        <Link href={routeNames.HOME}>
          <Button variant="outline">{t('backHome')}</Button>
        </Link>
      </main>
    );
  }

  const user = await getUserAccountData();

  return <VoiceChannelContent channelId={channel.id} channelName={channel.name} user={user} />;
}
