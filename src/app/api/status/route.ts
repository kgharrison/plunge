import { NextRequest, NextResponse } from 'next/server';
import { getPoolStatus } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode, getDemoSessionOverrides } from '@/lib/api-utils';
import { getDemoStatus } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    // Demo mode - return static data with session overrides
    if (isDemoMode(credentials)) {
      const overrides = getDemoSessionOverrides(request);
      const status = await getDemoStatus(overrides);
      return NextResponse.json(status);
    }
    
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
