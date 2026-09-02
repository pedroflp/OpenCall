import { NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { getUser, isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { generateUniqueInviteCode } from '@/lib/invite/generateInviteCode';
import { listAdminInvites } from './queries';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const invites = await listAdminInvites();
  return NextResponse.json({ invites });
}

/** Multi-uso, sem expiração — o mesmo código serve pra vários convidados até alguém revogar. */
export async function POST() {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const user = await getUser();

  try {
    const code = await generateUniqueInviteCode();
    const invite = await prisma.inviteCode.create({ data: { code, createdById: user?.id } });
    return NextResponse.json({ invite });
  } catch {
    return err(500, 'CREATE_FAILED');
  }
}
