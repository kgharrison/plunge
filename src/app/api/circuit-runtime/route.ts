import { NextRequest, NextResponse } from 'next/server';
import { setCircuitRuntime } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// POST /api/circuit-runtime - Set circuit runtime (egg timer)
// Body: { circuitId: number, minutes: number }
export async function POST(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    const body = await request.json();
    const { circuitId, minutes } = body;

    if (typeof circuitId !== 'number' || typeof minutes !== 'number') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'circuitId and minutes are required' },
        { status: 400 }
      );
    }

    if (minutes < 1 || minutes > 1440) {
      return NextResponse.json(
        { error: 'Invalid runtime', message: 'minutes must be between 1 and 1440 (24 hours)' },
        { status: 400 }
      );
    }

    await setCircuitRuntime(circuitId, minutes, credentials);
    return NextResponse.json({ success: true, circuitId, minutes });
  } catch (error) {
    console.error('Failed to set circuit runtime:', error);
    return NextResponse.json(
      { error: 'Failed to set circuit runtime', message: (error as Error).message },
      { status: 500 }
    );
  }
}
