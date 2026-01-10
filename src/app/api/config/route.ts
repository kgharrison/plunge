import { NextRequest, NextResponse } from 'next/server';
import { getFullConfig } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { getDemoConfig } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config - Get full controller and equipment configuration
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      const config = await getDemoConfig();
      return NextResponse.json(config);
    }
    
    const config = await getFullConfig(credentials);
    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to get config:', error);
    return NextResponse.json(
      { error: 'Failed to get config', message: (error as Error).message },
      { status: 500 }
    );
  }
}
