import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

async function readUserId(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  return typeof body?.userId === 'string' && body.userId ? body.userId : null;
}

/** Aceita tanto `userId` (single, usado pra remoção) quanto `userIds` (multiselect na adição). */
async function readUserIds(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { userId?: unknown; userIds?: unknown } | null;
  if (Array.isArray(body?.userIds)) {
    const ids = body.userIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return ids.length > 0 ? ids : null;
  }
  return typeof body?.userId === 'string' && body.userId ? [body.userId] : null;
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const userIds = await readUserIds(req);
  if (!userIds) return err(400, 'INVALID_USER_ID');

  try {
    // Uma transação só pro batch inteiro (em vez de N requests/transactions
    // separados do client) — é o que deixa o multiselect rápido de fato.
    await prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, groups: true } });
      await Promise.all(
        users
          .filter((user) => !user.groups.includes(params.groupId))
          .map((user) => tx.user.update({ where: { id: user.id }, data: { groups: { push: params.groupId } } })),
      );
    });
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'ADD_MEMBER_FAILED');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { groupId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const userId = await readUserId(req);
  if (!userId) return err(400, 'INVALID_USER_ID');

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { groups: true } });
      const groups = user.groups.filter((groupId) => groupId !== params.groupId);
      await tx.user.update({ where: { id: userId }, data: { groups } });
    });
    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'REMOVE_MEMBER_FAILED');
  }
}

export const dynamic = 'force-dynamic';
