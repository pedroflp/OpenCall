import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/** Soft-revoke (revokedAt), não delete — mantém redeemedCount e o código em si pra histórico, só para de aceitar resgate novo. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  try {
    await prisma.inviteCode.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return err(404, 'INVITE_NOT_FOUND');
  }
}
