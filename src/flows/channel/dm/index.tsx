import { Link } from 'next-view-transitions';
import { getTranslations } from 'next-intl/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getConversationForParticipant } from '@/lib/dm/access';
import { loadChannelsIdentity } from '@/lib/profile/query';
import { routeNames } from '@/app/route.names';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import DirectConversationView from './DirectConversationView';

// Auth e canalAccess já foram checados no layout (ver src/app/(channels)/layout.tsx)
// — ele só renderiza `children` (e portanto esta página) quando os dois estão
// liberados, então `authUser` aqui nunca é null.
export default async function DirectConversationPage({ conversationId }: { conversationId: string }) {
  const authUser = (await getUser())!;

  // A checagem de participante acontece ANTES de qualquer identidade ser
  // resolvida ou enviada ao client — um "não encontrada" daqui não vaza nome
  // nem avatar de ninguém (mesmo invariante das rotas de API de DM).
  const conversation = await getConversationForParticipant(conversationId, authUser.id);

  if (!conversation) {
    const t = await getTranslations('channels');

    return (
      <main className="flex h-full flex-col items-center justify-center gap-8">
        <HugeIcon name="bubble-chat" size={92} />
        <h1 className="text-3xl font-bold">{t('notFound')}</h1>
        <Link href={routeNames.HOME}>
          <Button variant="outline">{t('backHome')}</Button>
        </Link>
      </main>
    );
  }

  const otherUserId = conversation.participantAId === authUser.id ? conversation.participantBId : conversation.participantAId;

  // A máscara é resolvida aqui, no servidor — mesmo raciocínio de
  // flows/channel/text/index.tsx: getUser() devolve a identidade do Discord,
  // e o /channels inteiro (DM inclusa) mostra o apelido.
  const [currentIdentity, otherIdentity] = await Promise.all([
    loadChannelsIdentity(authUser.id, { username: authUser.username, avatar: authUser.avatar }),
    loadChannelsIdentity(otherUserId, { username: '', avatar: '' }),
  ]);

  return (
    <DirectConversationView
      conversationId={conversationId}
      currentUser={{ id: authUser.id, username: currentIdentity.username, avatar: currentIdentity.avatar }}
      otherParticipant={{ id: otherUserId, username: otherIdentity.username, avatar: otherIdentity.avatar }}
      // Lido no servidor: a chave do GIPHY é secreta e nunca chega no browser.
      gifPickerEnabled={Boolean(process.env.GIPHY_API_KEY)}
    />
  );
}
