import { NextResponse } from 'next/server';
import { isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { listAdminUsers } from './queries';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/** Lista enxuta de todo mundo da plataforma, usada pela aba Usuários (ADMIN + CHANNELS_ACCESS) e pelo picker de membros da tela de admin de grupos (ADMIN-only). */
export async function GET() {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export const dynamic = 'force-dynamic';
