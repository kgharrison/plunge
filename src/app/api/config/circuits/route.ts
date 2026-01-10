import { NextRequest, NextResponse } from 'next/server';
import { getControllerConfig } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { getDemoConfig } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config/circuits - Get just the circuit list (lightweight)
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      const config = await getDemoConfig();
      return NextResponse.json({ circuits: config.controller.circuitArray });
    }
    
    const config = await getControllerConfig(credentials);
    return NextResponse.json({ circuits: config.circuitArray });
  } catch (error) {
    console.error('Failed to get circuits:', error);
    return NextResponse.json(
      { error: 'Failed to get circuits', message: (error as Error).message },
      { status: 500 }
    );
  }
}
