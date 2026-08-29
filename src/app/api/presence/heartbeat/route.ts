import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { touchHeartbeat } from '@/lib/presence/platformPresence';

/** Ping periódico do client enquanto a aba está aberta — prova presença sem contar como atividade real. */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json(null, { status: 401 });

  touchHeartbeat(user.id);
  return NextResponse.json({ success: true });
}
