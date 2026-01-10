import { NextRequest, NextResponse } from 'next/server';
import { setCircuitRuntime, setCircuitConfig } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/config/circuit/[id] - Update circuit configuration
 * Body options:
 *   { runtime: number } - Set egg timer runtime in minutes (0 = no limit, max 720)
 *   { nameIndex, function, interface, freeze, colorPos } - Set circuit config
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const circuitId = parseInt(id, 10);
    
    if (isNaN(circuitId)) {
      return NextResponse.json(
        { error: 'Invalid circuit ID' },
        { status: 400 }
      );
    }
    
    const credentials = getCredentialsFromRequest(request);
    const body = await request.json();
    
    // Check if this is a runtime update or a full config update
    if ('runtime' in body) {
      const { runtime } = body;
      
      if (typeof runtime !== 'number') {
        return NextResponse.json(
          { error: 'runtime must be a number (minutes)' },
          { status: 400 }
        );
      }
      
      // Validate runtime range (0-720 minutes = 0-12 hours)
      if (runtime < 0 || runtime > 720) {
        return NextResponse.json(
          { error: 'Runtime must be between 0 and 720 minutes' },
          { status: 400 }
        );
      }
      
      await setCircuitRuntime(circuitId, runtime, credentials);
      return NextResponse.json({ success: true, type: 'runtime' });
    }
    
    // Full circuit config update
    const { nameIndex, function: circuitFunction, interface: circuitInterface, freeze, colorPos } = body;
    
    if (nameIndex === undefined || circuitFunction === undefined || circuitInterface === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: nameIndex, function, interface' },
        { status: 400 }
      );
    }
    
    await setCircuitConfig(
      circuitId,
      nameIndex,
      circuitFunction,
      circuitInterface,
      freeze ?? false,
      colorPos ?? 0,
      credentials
    );
    
    return NextResponse.json({ success: true, type: 'config' });
  } catch (error) {
    console.error('Failed to update circuit:', error);
    return NextResponse.json(
      { error: 'Failed to update circuit', message: (error as Error).message },
      { status: 500 }
    );
  }
}
