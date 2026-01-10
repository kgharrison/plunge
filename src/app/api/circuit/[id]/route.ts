import { NextRequest, NextResponse } from 'next/server';
import { setCircuitState } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

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
