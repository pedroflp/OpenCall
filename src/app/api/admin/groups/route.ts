import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { listAdminGroups } from './queries';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const groups = await listAdminGroups();
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const body = (await req.json().catch(() => null)) as { title?: unknown; textColor?: unknown; sortIndex?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const textColor = typeof body?.textColor === 'string' ? body.textColor.trim() : '';
  const sortIndex = body?.sortIndex;

  if (!title) return err(400, 'INVALID_TITLE');
  if (!textColor) return err(400, 'INVALID_COLOR');
  if (typeof sortIndex !== 'number' || !Number.isFinite(sortIndex)) return err(400, 'INVALID_SORT_INDEX');

  try {
    const group = await prisma.group.create({ data: { title, textColor, sortIndex } });
    return NextResponse.json({ group });
  } catch {
    return err(500, 'CREATE_FAILED');
  }
}

export const dynamic = 'force-dynamic';
