import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { getPairingStatus } from '@/lib/auth/devicePairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PC faz polling nisso enquanto o modal do QR está aberto. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  return NextResponse.json({ status: getPairingStatus(params.id) });
}
