import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { touchActivity } from '@/lib/presence/platformPresence';

/** Chamado pelo client a cada navegação (ver usePlatformPresenceHeartbeat). */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json(null, { status: 401 });

  touchActivity(user.id);

  return NextResponse.json({ success: true });
}
