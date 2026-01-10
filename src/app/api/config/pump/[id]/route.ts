import { NextRequest, NextResponse } from 'next/server';
import { getPumpStatus, setPumpCircuitSpeed } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config/pump/[id] - Get pump status and configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pumpId = parseInt(id, 10);
    
    if (isNaN(pumpId)) {
      return NextResponse.json(
        { error: 'Invalid pump ID' },
        { status: 400 }
      );
    }
    
    const credentials = getCredentialsFromRequest(request);
    const pump = await getPumpStatus(pumpId, credentials);
    
    if (!pump) {
      return NextResponse.json(
        { error: 'Pump not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(pump);
  } catch (error) {
    console.error('Failed to get pump status:', error);
    return NextResponse.json(
      { error: 'Failed to get pump status', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config/pump/[id] - Update pump circuit speed
 * Body: { circuitId: number, speed: number, isRPM?: boolean }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pumpId = parseInt(id, 10);
    
    if (isNaN(pumpId)) {
      return NextResponse.json(
        { error: 'Invalid pump ID' },
        { status: 400 }
      );
    }
    
    const credentials = getCredentialsFromRequest(request);
    const body = await request.json();
    
    const { circuitId, speed, isRPM = true } = body;
    
    if (!circuitId || speed === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: circuitId, speed' },
        { status: 400 }
      );
    }
    
    await setPumpCircuitSpeed(pumpId, circuitId, speed, isRPM, credentials);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update pump speed:', error);
    return NextResponse.json(
      { error: 'Failed to update pump speed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
