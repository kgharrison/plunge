import { NextRequest, NextResponse } from 'next/server';
import { getPoolStatus } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    const status = await getPoolStatus(credentials);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to get pool status:', error);
    return NextResponse.json(
      { error: 'Failed to connect to pool', message: (error as Error).message },
      { status: 500 }
    );
  }
}
