import { NextRequest, NextResponse } from 'next/server';
import { setCircuitState } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { setDemoCircuitState } from '@/lib/demo-data';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const circuitId = parseInt(id);
    const body = await request.json();
    const { state } = body;

    if (typeof state !== 'boolean') {
      return NextResponse.json(
        { error: 'state must be a boolean' },
        { status: 400 }
      );
    }

    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      await setDemoCircuitState(circuitId, state);
      return NextResponse.json({ success: true, circuitId, state, demo: true });
    }
    
    await setCircuitState(circuitId, state, credentials);
    return NextResponse.json({ success: true, circuitId, state });
  } catch (error) {
    console.error('Failed to set circuit state:', error);
    return NextResponse.json(
      { error: 'Failed to set circuit state', message: (error as Error).message },
      { status: 500 }
    );
  }
}
