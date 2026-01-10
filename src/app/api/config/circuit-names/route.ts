import { NextRequest, NextResponse } from 'next/server';
import { getCircuitDefinitions, getCustomNames, setCustomName } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config/circuit-names - Get all available circuit names
 * Returns: { builtIn: [{id, name}], custom: string[] }
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    // Demo mode - return empty arrays (circuit names not critical for demo)
    if (isDemoMode(credentials)) {
      return NextResponse.json({ builtIn: [], custom: [] });
    }
    
    const [builtIn, custom] = await Promise.all([
      getCircuitDefinitions(credentials),
      getCustomNames(credentials),
    ]);
    
    return NextResponse.json({ builtIn, custom });
  } catch (error) {
    console.error('Failed to get circuit names:', error);
    return NextResponse.json(
      { error: 'Failed to get circuit names', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config/circuit-names - Set a custom name
 * Body: { index: number, name: string } - index 0-19, name max 11 chars
 */
export async function PUT(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      return NextResponse.json({ success: true, demo: true });
    }
    
    const body = await request.json();
    
    const { index, name } = body;
    
    if (typeof index !== 'number' || index < 0 || index > 19) {
      return NextResponse.json(
        { error: 'index must be a number between 0 and 19' },
        { status: 400 }
      );
    }
    
    if (typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name must be a string' },
        { status: 400 }
      );
    }
    
    if (name.length > 11) {
      return NextResponse.json(
        { error: 'name must be 11 characters or less' },
        { status: 400 }
      );
    }
    
    await setCustomName(index, name, credentials);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to set custom name:', error);
    return NextResponse.json(
      { error: 'Failed to set custom name', message: (error as Error).message },
      { status: 500 }
    );
  }
}
