import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function PATCH(req: NextRequest, { params }: { params: { groupId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const body = (await req.json().catch(() => null)) as { title?: unknown; textColor?: unknown; sortIndex?: unknown } | null;
  const updates: { title?: string; textColor?: string; sortIndex?: number } = {};
  if (typeof body?.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.textColor === 'string' && body.textColor.trim()) updates.textColor = body.textColor.trim();
  if (typeof body?.sortIndex === 'number' && Number.isFinite(body.sortIndex)) updates.sortIndex = body.sortIndex;

  if (Object.keys(updates).length === 0) return err(400, 'NO_VALID_FIELDS');

  try {
    const group = await prisma.group.update({ where: { id: params.groupId }, data: updates });
    return NextResponse.json({ group });
  } catch {
    return err(500, 'UPDATE_FAILED');
  }
}

/** Apaga o grupo e limpa a referência em todo mundo que era membro dele. */
export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string } }) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  try {
    await prisma.$transaction(async (tx) => {
      const members = await tx.user.findMany({ where: { groups: { has: params.groupId } }, select: { id: true, groups: true } });
      await Promise.all(
        members.map((member) =>
          tx.user.update({
            where: { id: member.id },
            data: { groups: member.groups.filter((groupId) => groupId !== params.groupId) },
          }),
        ),
      );
      await tx.group.delete({ where: { id: params.groupId } });
    });

    return NextResponse.json({ success: true });
  } catch {
    return err(500, 'DELETE_FAILED');
  }
}

export const dynamic = 'force-dynamic';
