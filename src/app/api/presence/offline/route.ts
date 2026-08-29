import { NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { markOffline } from '@/lib/presence/platformPresence';

/** Disparado via sendBeacon no unload/pagehide — marca offline na hora, sem esperar o grace period. */
export async function POST() {
  const user = await getUser();
  if (user) markOffline(user.id);
  return NextResponse.json({ success: true });
}
