import { NextResponse } from 'next/server';
import { pingClamAv } from '@/lib/clamav/client';

export async function GET() {
  const isReady = await pingClamAv();
  return NextResponse.json({ ready: isReady }, { status: isReady ? 200 : 503 });
}
