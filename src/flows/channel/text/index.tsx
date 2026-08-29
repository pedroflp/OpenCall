import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import TextChannelView from './TextChannelView';

// Auth e canalAccess já foram checados no layout (ver src/app/(channels)/layout.tsx)
// — ele só renderiza `children` (e portanto esta página) quando os dois estão
// liberados, então `authUser` aqui nunca é null.
export default async function TextChannelPage() {
  const authUser = (await getUser())!;

  return <TextChannelView user={authUser} />;
}
