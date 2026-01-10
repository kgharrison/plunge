import { NextRequest, NextResponse } from 'next/server';
import { getControllerConfig } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config/circuits - Get just the circuit list (lightweight)
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
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
