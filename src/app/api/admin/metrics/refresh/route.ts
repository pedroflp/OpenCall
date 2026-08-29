import { NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { getMetricsSeries, parseMetricsRange } from '@/lib/metrics/series';
import { runRemoteCollection } from '@/lib/metrics/sshCollect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const range = parseMetricsRange(new URL(req.url).searchParams.get('range'));
  if (!range) return err(400, 'INVALID_RANGE');

  try {
    await runRemoteCollection();
  } catch (error) {
    console.error('refresh metrics: coleta via SSH falhou', error);
    return err(502, 'COLLECTION_FAILED');
  }

  return NextResponse.json(await getMetricsSeries(range));
}
