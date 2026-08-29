import { NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { computeForecast } from '@/lib/metrics/forecast';

export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) return err(403, 'FORBIDDEN');

  const forecast = await computeForecast();
  return NextResponse.json(forecast);
}
